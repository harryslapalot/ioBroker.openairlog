'use strict';

const utils = require('@iobroker/adapter-core');
const {
    summarizeDay,
    directionForFlight,
    isFrankfurt,
    sortFlights
} = require('./lib/flightLogic');

class OpenAirLog extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'openairlog'
        });

        this.pollTimer = null;

        this.on('ready', () => this.onReady());
        this.on('unload', callback => this.onUnload(callback));
    }

    async onReady() {
        await this.setStateAsync('info.connection', false, true);

        if (!this.config.apiKey) {
            this.log.error('No OpenAirLog API key configured.');
            return;
        }

        this.pollInterval =
            Math.max(5, Number(this.config.interval) || 15) * 60 * 1000;

        await this.createObjects();
        await this.updateData();

        this.pollTimer = setInterval(() => {
            this.updateData().catch(error => {
                this.log.error(`OpenAirLog: ${error.message}`);
            });
        }, this.pollInterval);
    }

    async createState(id, common) {
        await this.extendObjectAsync(id, {
            type: 'state',
            common,
            native: {}
        });
    }

    async createObjects() {
        // Information
        await this.extendObjectAsync('info', {
            type: 'channel',
            common: {
                name: 'Information'
            },
            native: {}
        });

        await this.createState('info.connection', {
            name: 'API connection',
            type: 'boolean',
            role: 'indicator.connected',
            read: true,
            write: false
        });

        await this.createState('info.lastUpdate', {
            name: 'Last successful update',
            type: 'string',
            role: 'date',
            read: true,
            write: false
        });

        // Today
        await this.extendObjectAsync('today', {
            type: 'channel',
            common: {
                name: 'Today'
            },
            native: {}
        });

        const states = {
            hasFlight: ['Has flight', 'boolean', 'indicator'],
            flightCount: ['Flight count', 'number', 'value'],

            firstFlightNumber: ['First flight number', 'string', 'text'],
            firstDeparture: ['First departure', 'string', 'text'],
            firstArrival: ['First arrival', 'string', 'text'],
            firstScheduledOffBlock: [
                'First scheduled off-block',
                'string',
                'text'
            ],
            firstScheduledOnBlock: [
                'First scheduled on-block',
                'string',
                'text'
            ],

            lastFlightNumber: ['Last flight number', 'string', 'text'],
            lastDeparture: ['Last departure', 'string', 'text'],
            lastArrival: ['Last arrival', 'string', 'text'],
            lastScheduledOffBlock: [
                'Last scheduled off-block',
                'string',
                'text'
            ],
            lastScheduledOnBlock: [
                'Last scheduled on-block',
                'string',
                'text'
            ],

            startsInFrankfurt: [
                'Starts in Frankfurt',
                'boolean',
                'indicator'
            ],

            endsInFrankfurt: [
                'Ends in Frankfurt',
                'boolean',
                'indicator'
            ],

            isOutbound: [
                'Has outbound flight',
                'boolean',
                'indicator'
            ],

            isInbound: [
                'Has inbound flight',
                'boolean',
                'indicator'
            ],

            direction: [
                'Direction',
                'string',
                'text'
            ],

            currentLocation: [
                'Current location',
                'string',
                'text'
            ],

            isCurrentlyAway: [
                'Currently away from Frankfurt',
                'boolean',
                'indicator'
            ]
        };

        for (const [id, [name, type, role]] of Object.entries(states)) {
            await this.createState(`today.${id}`, {
                name,
                type,
                role,
                read: true,
                write: false
            });
        }

        await this.extendObjectAsync('today.flights', {
            type: 'channel',
            common: {
                name: 'Flights today'
            },
            native: {}
        });

        // Next flight
        await this.extendObjectAsync('next', {
            type: 'channel',
            common: {
                name: 'Next flight'
            },
            native: {}
        });

        for (const id of [
            'flightNumber',
            'date',
            'departure',
            'arrival',
            'scheduledOffBlock',
            'scheduledOnBlock'
        ]) {
            await this.createState(`next.${id}`, {
                name: id,
                type: 'string',
                role: 'text',
                read: true,
                write: false
            });
        }
    }

    async request(path) {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 20000);

        try {
            const response = await fetch(
                `https://openairlog.de/api/v1${path}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.config.apiKey}`,
                        Accept: 'application/json'
                    },
                    signal: controller.signal
                }
            );

            if (response.status === 429) {
                const retryAfter = response.headers.get('retry-after');

                throw new Error(
                    `OpenAirLog rate limit exceeded${
                        retryAfter
                            ? `; retry after ${retryAfter}s`
                            : ''
                    }`
                );
            }

            if (!response.ok) {
                throw new Error(
                    `OpenAirLog API returned HTTP ${response.status}`
                );
            }

            return response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    getDateRange() {
        const now = new Date();

        const start = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - 1
        );

        const end = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 2
        );

        const iso = date => date.toISOString().slice(0, 10);

        return {
            from: iso(start),
            to: iso(end),
            today: iso(now)
        };
    }

    async updateData() {
        try {
            const { from, to, today } = this.getDateRange();

            const response = await this.request(
                `/flights?from=${from}&to=${to}&per_page=200`
            );

            const flights = Array.isArray(response?.data)
                ? response.data
                : [];

            const todayFlights = flights.filter(
                flight => flight.date === today
            );

            const summary = summarizeDay(
                todayFlights,
                this.config.evenIsOutbound !== false
            );

            await this.publishToday(summary);

            await this.publishNext(flights);

            await this.setStateAsync(
                'info.connection',
                true,
                true
            );

            await this.setStateAsync(
                'info.lastUpdate',
                new Date().toISOString(),
                true
            );
        } catch (error) {
            await this.setStateAsync(
                'info.connection',
                false,
                true
            );

            throw error;
        }
    }

    async publishToday(summary) {
        const set = (id, value) =>
            this.setStateAsync(
                id,
                value ?? '',
                true
            );

        await set(
            'today.hasFlight',
            summary.flightCount > 0
        );

        await set(
            'today.flightCount',
            summary.flightCount
        );

        await set(
            'today.startsInFrankfurt',
            summary.startsInFrankfurt
        );

        await set(
            'today.endsInFrankfurt',
            summary.endsInFrankfurt
        );

        await set(
            'today.isOutbound',
            summary.isOutbound
        );

        await set(
            'today.isInbound',
            summary.isInbound
        );

        await set(
            'today.direction',
            summary.direction
        );

        const first = summary.first;
        const last = summary.last;

        const firstLastValues = {
            firstFlightNumber: first?.flight_number,
            firstDeparture: first?.departure,
            firstArrival: first?.arrival,
            firstScheduledOffBlock:
                first?.scheduled_off_block,
            firstScheduledOnBlock:
                first?.scheduled_on_block,

            lastFlightNumber: last?.flight_number,
            lastDeparture: last?.departure,
            lastArrival: last?.arrival,
            lastScheduledOffBlock:
                last?.scheduled_off_block,
            lastScheduledOnBlock:
                last?.scheduled_on_block
        };

        for (const [id, value] of Object.entries(
            firstLastValues
        )) {
            await set(`today.${id}`, value);
        }

        /*
         * Current location
         *
         * This is deliberately conservative. We only use scheduled
         * departure times that have already passed.
         */
        let currentLocation =
            first?.departure || '';

        const now = new Date();

        for (const flight of sortFlights(summary.flights)) {
            if (
                !flight.date ||
                !flight.scheduled_off_block
            ) {
                continue;
            }

            const scheduledDeparture =
                new Date(
                    `${flight.date}T${flight.scheduled_off_block}`
                );

            if (
                !Number.isNaN(
                    scheduledDeparture.getTime()
                ) &&
                scheduledDeparture <= now
            ) {
                currentLocation =
                    flight.arrival ||
                    currentLocation;
            }
        }

        await set(
            'today.currentLocation',
            currentLocation
        );

        await set(
            'today.isCurrentlyAway',
            Boolean(currentLocation) &&
            !isFrankfurt(currentLocation)
        );

        /*
         * Individual flights
         */
        for (
            let i = 0;
            i < summary.flights.length;
            i++
        ) {
            const flight = summary.flights[i];

            const channelId =
                `today.flights.${i}`;

            await this.extendObjectAsync(
                channelId,
                {
                    type: 'channel',
                    common: {
                        name:
                            `${flight.flight_number || ''} ` +
                            `${flight.departure || ''} → ` +
                            `${flight.arrival || ''}`.trim()
                    },
                    native: {}
                }
            );

            const fields = {
                flightNumber:
                    flight.flight_number,

                date:
                    flight.date,

                departure:
                    flight.departure,

                arrival:
                    flight.arrival,

                scheduledOffBlock:
                    flight.scheduled_off_block,

                scheduledOnBlock:
                    flight.scheduled_on_block,

                aircraftType:
                    flight.aircraft_type,

                aircraftRegistration:
                    flight.aircraft_registration,

                crewPosition:
                    flight.crew_position,

                blockMinutes:
                    flight.block_minutes,

                direction:
                    directionForFlight(
                        flight,
                        this.config.evenIsOutbound !== false
                    )
            };

            for (
                const [id, value]
                of Object.entries(fields)
            ) {
                const type =
                    typeof value === 'number'
                        ? 'number'
                        : 'string';

                const role =
                    type === 'number'
                        ? 'value'
                        : 'text';

                await this.createState(
                    `${channelId}.${id}`,
                    {
                        name: id,
                        type,
                        role,
                        read: true,
                        write: false
                    }
                );

                await set(
                    `${channelId}.${id}`,
                    value
                );
            }
        }
    }

    async publishNext(flights) {
        const sorted = sortFlights(flights);

        const next = sorted.find(
            flight =>
                flight.date &&
                flight.scheduled_off_block
        );

        const set = (id, value) =>
            this.setStateAsync(
                `next.${id}`,
                value ?? '',
                true
            );

        for (
            const [id, value]
            of Object.entries({
                flightNumber:
                    next?.flight_number,

                date:
                    next?.date,

                departure:
                    next?.departure,

                arrival:
                    next?.arrival,

                scheduledOffBlock:
                    next?.scheduled_off_block,

                scheduledOnBlock:
                    next?.scheduled_on_block
            })
        ) {
            await set(id, value);
        }
    }

    onUnload(callback) {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }

        callback();
    }
}

if (require.main !== module) {
    module.exports = options =>
        new OpenAirLog(options);
} else {
    new OpenAirLog();
}
