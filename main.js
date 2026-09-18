'use strict';

const utils = require('@iobroker/adapter-core');

const {
    normalizeHomebase,
    filterFlights,
    routeDirection,
    parseTimeToSeconds,
    getDepartureTime,
    getArrivalTime,
    findNextFlight,
    getHomebaseAction,
    summarizeDay,
    getCurrentFlight,
    getCurrentLocation
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
        await this.createObjects();

        await this.setStateAsync(
            'info.connection',
            false,
            true
        );

        if (!this.config.apiKey) {
            this.log.error(
                'No OpenAirLog API key configured.'
            );
            return;
        }

        this.homebase =
            normalizeHomebase(
                this.config.homebase
            );

        this.pollInterval =
            Math.max(
                5,
                Number(this.config.interval) || 15
            ) * 60 * 1000;

        await this.updateData();

        this.pollTimer = setInterval(() => {
            this.updateData().catch(error => {
                this.log.error(
                    `OpenAirLog: ${error.message}`
                );
            });
        }, this.pollInterval);
    }

    async onUnload(callback) {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        callback();
    }

    async createState(id, common) {
        await this.extendObjectAsync(id, {
            type: 'state',
            common,
            native: {}
        });
    }

    async createObjects() {
        await this.extendObjectAsync(
            'info',
            {
                type: 'channel',
                common: {
                    name: 'Information'
                },
                native: {}
            }
        );

        await this.createState(
            'info.connection',
            {
                name: 'API connection',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: false
            }
        );

        await this.createState(
            'info.lastUpdate',
            {
                name: 'Last successful update',
                type: 'string',
                role: 'date',
                read: true,
                write: false
            }
        );

        await this.extendObjectAsync(
            'today',
            {
                type: 'channel',
                common: {
                    name: 'Today'
                },
                native: {}
            }
        );

        const states = {
            hasFlight: [
                'Has flight',
                'boolean',
                'indicator'
            ],

            flightCount: [
                'Flight count',
                'number',
                'value'
            ],

            homebase: [
                'Configured homebase',
                'string',
                'text'
            ],

            homebaseAction: [
                'Homebase action',
                'string',
                'text'
            ],

            startsInHomebase: [
                'Starts in homebase',
                'boolean',
                'indicator'
            ],

            endsInHomebase: [
                'Ends in homebase',
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

            firstFlightNumber: [
                'First flight number',
                'string',
                'text'
            ],

            firstDeparture: [
                'First departure',
                'string',
                'text'
            ],

            firstArrival: [
                'First arrival',
                'string',
                'text'
            ],

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

            lastFlightNumber: [
                'Last flight number',
                'string',
                'text'
            ],

            lastDeparture: [
                'Last departure',
                'string',
                'text'
            ],

            lastArrival: [
                'Last arrival',
                'string',
                'text'
            ],

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

            currentLocation: [
                'Current location',
                'string',
                'text'
            ],

            isCurrentlyAway: [
                'Currently away from homebase',
                'boolean',
                'indicator'
            ],

            currentFlightNumber: [
                'Current flight number',
                'string',
                'text'
            ]
        };

        for (
            const [
                id,
                [name, type, role]
            ] of Object.entries(states)
        ) {
            await this.createState(
                `today.${id}`,
                {
                    name,
                    type,
                    role,
                    read: true,
                    write: false
                }
            );
        }

        await this.extendObjectAsync(
            'today.flights',
            {
                type: 'channel',
                common: {
                    name: 'Flights today'
                },
                native: {}
            }
        );

        await this.extendObjectAsync(
            'next',
            {
                type: 'channel',
                common: {
                    name: 'Next flight'
                },
                native: {}
            }
        );

        for (
            const id of [
                'flightNumber',
                'date',
                'departure',
                'arrival',
                'scheduledOffBlock',
                'scheduledOnBlock',
                'aircraftType',
                'aircraftRegistration',
                'crewPosition',
                'blockMinutes',
                'direction'
            ]
        ) {
            await this.createState(
                `next.${id}`,
                {
                    name: id,

                    type:
                        id === 'blockMinutes'
                            ? 'number'
                            : 'string',

                    role:
                        id === 'blockMinutes'
                            ? 'value'
                            : 'text',

                    read: true,
                    write: false
                }
            );
        }
    }

    async request(path) {
        const controller =
            new AbortController();

        const timeout =
            setTimeout(
                () => controller.abort(),
                20000
            );

        try {
            const response =
                await fetch(
                    `https://openairlog.de/api/v1${path}`,
                    {
                        headers: {
                            Authorization:
                                `Bearer ${this.config.apiKey}`,

                            Accept:
                                'application/json'
                        },

                        signal:
                            controller.signal
                    }
                );

            if (response.status === 401) {
                throw new Error(
                    'OpenAirLog API key is invalid or disabled.'
                );
            }

            if (response.status === 403) {
                throw new Error(
                    'OpenAirLog API permission denied.'
                );
            }

            if (response.status === 429) {
                const retryAfter =
                    response.headers.get(
                        'retry-after'
                    );

                throw new Error(
                    `OpenAirLog rate limit exceeded` +
                    (
                        retryAfter
                            ? `; retry after ${retryAfter}s`
                            : ''
                    )
                );
            }

            if (!response.ok) {
                throw new Error(
                    `OpenAirLog API returned HTTP ${response.status}`
                );
            }

            return await response.json();

        } finally {
            clearTimeout(timeout);
        }
    }

    getUtcDate() {
        return new Date()
            .toISOString()
            .slice(0, 10);
    }

    getUtcSeconds() {
        const now = new Date();

        return (
            now.getUTCHours() * 3600 +
            now.getUTCMinutes() * 60 +
            now.getUTCSeconds()
        );
    }

    getDateRange() {
        const now = new Date();

        const fromDate =
            new Date(now);

        fromDate.setUTCDate(
            fromDate.getUTCDate() - 7
        );

        const toDate =
            new Date(now);

        toDate.setUTCDate(
            toDate.getUTCDate() + 2
        );

        return {
            from:
                fromDate
                    .toISOString()
                    .slice(0, 10),

            to:
                toDate
                    .toISOString()
                    .slice(0, 10),

            today:
                this.getUtcDate()
        };
    }

    async publishFlightScnrPi(
        currentFlightNumber
    ) {
        const url =
            String(
                this.config.flightScnrPiUrl || ''
            ).trim();

        const token =
            String(
                this.config.flightScnrPiToken || ''
            ).trim();

        if (!url) {
            return;
        }

        if (!token) {
            this.log.warn(
                'FlightScnrPi export is configured, but no token is set.'
            );
            return;
        }

        try {
            const controller =
                new AbortController();

            const timeout =
                setTimeout(
                    () => controller.abort(),
                    10000
                );

            try {
                const response =
                    await fetch(
                        url,
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json',

                                Accept:
                                    'application/json',

                                Authorization:
                                    `Bearer ${token}`
                            },

                            body:
                                JSON.stringify({
                                    flightNumber:
                                        currentFlightNumber || ''
                                }),

                            signal:
                                controller.signal
                        }
                    );

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}`
                    );
                }

            } finally {
                clearTimeout(timeout);
            }

        } catch (error) {
            this.log.warn(
                `FlightScnrPi export failed: ${error.message}`
            );
        }
    }

    async updateData() {
        try {
            this.homebase =
                normalizeHomebase(
                    this.config.homebase
                );

            const {
                from,
                to,
                today
            } = this.getDateRange();

            const response =
                await this.request(
                    `/flights?from=${from}&to=${to}&per_page=200`
                );

            /*
             * IMPORTANT:
             *
             * Only records with a flight number
             * are considered actual flights.
             *
             * This filters out duty-plan entries such
             * as "Krank", which may contain EDDF as
             * departure and arrival but have no
             * flight number.
             */
            const flights =
                filterFlights(
                    Array.isArray(response?.data)
                        ? response.data
                        : []
                );

            const todayFlights =
                flights.filter(
                    flight =>
                        flight?.date === today
                );

            const currentSeconds =
                this.getUtcSeconds();

            const summary =
                summarizeDay(
                    todayFlights,
                    today,
                    this.homebase
                );

            const homebaseAction =
                getHomebaseAction(
                    todayFlights,
                    today,
                    this.homebase,
                    currentSeconds
                );

            await this.publishToday(
                summary,
                homebaseAction,
                currentSeconds,
                flights
            );

            const next =
                findNextFlight(
                    flights,
                    today,
                    currentSeconds
                );

            await this.publishNext(
                next
            );

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

    async cleanupOldFlightObjects(
        flightCount
    ) {
        const objects =
            await this.getForeignObjectsAsync(
                `${this.namespace}.today.flights.*`
            );

        if (!objects) {
            return;
        }

        const validIndexes =
            new Set(
                Array.from(
                    {
                        length: flightCount
                    },
                    (_, index) =>
                        String(index)
                )
            );

        const prefix =
            `${this.namespace}.today.flights.`;

        for (
            const objectId of
                Object.keys(objects)
        ) {
            if (
                !objectId.startsWith(prefix)
            ) {
                continue;
            }

            const relative =
                objectId.slice(
                    prefix.length
                );

            const match =
                relative.match(
                    /^(\d+)$/
                );

            if (!match) {
                continue;
            }

            const index =
                match[1];

            if (
                validIndexes.has(index)
            ) {
                continue;
            }

            await this.delForeignObjectAsync(
                `${this.namespace}.today.flights.${index}`,
                {
                    recursive: true
                }
            );
        }
    }

    async publishToday(
        summary,
        homebaseAction,
        currentSeconds,
        allFlights
    ) {
        const set =
            (id, value) =>
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
            'today.homebase',
            this.homebase
        );

        await set(
            'today.homebaseAction',
            homebaseAction
        );

        await set(
            'today.startsInHomebase',
            summary.startsInHomebase
        );

        await set(
            'today.endsInHomebase',
            summary.endsInHomebase
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

        const first =
            summary.first;

        const last =
            summary.last;

        const firstOffBlock =
            first
                ? getDepartureTime(first)
                : null;

        const firstOnBlock =
            first
                ? getArrivalTime(first)
                : null;

        const lastOffBlock =
            last
                ? getDepartureTime(last)
                : null;

        const lastOnBlock =
            last
                ? getArrivalTime(last)
                : null;

        const values = {

            firstFlightNumber:
                first?.flight_number,

            firstDeparture:
                first?.departure,

            firstArrival:
                first?.arrival,

            firstScheduledOffBlock:
                firstOffBlock,

            firstScheduledOnBlock:
                firstOnBlock,

            lastFlightNumber:
                last?.flight_number,

            lastDeparture:
                last?.departure,

            lastArrival:
                last?.arrival,

            lastScheduledOffBlock:
                lastOffBlock,

            lastScheduledOnBlock:
                lastOnBlock
        };

        for (
            const [
                id,
                value
            ] of Object.entries(values)
        ) {
            await set(
                `today.${id}`,
                value
            );
        }

        /*
         * Current flight:
         *
         * This uses ONLY scheduled off-block and
         * scheduled on-block times.
         */
        const currentFlight =
            getCurrentFlight(
                allFlights,
                new Date()
            );

        const currentFlightNumber =
            currentFlight?.flight_number || '';

        await set(
            'today.currentFlightNumber',
            currentFlightNumber
        );

        /*
         * Send the current flight number to
         * the configured FlightScnrPi endpoint.
         *
         * The endpoint creates the JSON file and
         * adds the server-side update timestamp.
         */
        await this.publishFlightScnrPi(
            currentFlightNumber
        );

        /*
         * Current location uses the complete
         * historical flight data.
         */
        const currentPosition =
            getCurrentLocation(
                allFlights,
                new Date()
            );

        const currentLocation =
            currentPosition.location || '';

        await set(
            'today.currentLocation',
            currentLocation
        );

        await set(
            'today.isCurrentlyAway',
            Boolean(currentLocation) &&
            currentLocation !== this.homebase
        );

        await this.cleanupOldFlightObjects(
            summary.flights.length
        );

        for (
            let i = 0;
            i < summary.flights.length;
            i++
        ) {
            const flight =
                summary.flights[i];

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
                            `${flight.arrival || ''}`
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
                    getDepartureTime(
                        flight
                    ),

                scheduledOnBlock:
                    getArrivalTime(
                        flight
                    ),

                aircraftType:
                    flight.aircraft_type,

                aircraftRegistration:
                    flight.aircraft_registration,

                crewPosition:
                    flight.crew_position,

                blockMinutes:
                    flight.block_minutes,

                direction:
                    routeDirection(
                        flight,
                        this.homebase
                    )
            };

            for (
                const [
                    id,
                    value
                ] of Object.entries(fields)
            ) {
                await this.createState(
                    `${channelId}.${id}`,
                    {
                        name: id,

                        type:
                            typeof value === 'number'
                                ? 'number'
                                : 'string',

                        role:
                            typeof value === 'number'
                                ? 'value'
                                : 'text',

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

    async publishNext(flight) {
        const values = {

            flightNumber:
                flight?.flight_number || '',

            date:
                flight?.date || '',

            departure:
                flight?.departure || '',

            arrival:
                flight?.arrival || '',

            scheduledOffBlock:
                flight
                    ? getDepartureTime(flight)
                    : '',

            scheduledOnBlock:
                flight
                    ? getArrivalTime(flight)
                    : '',

            aircraftType:
                flight?.aircraft_type || '',

            aircraftRegistration:
                flight?.aircraft_registration || '',

            crewPosition:
                flight?.crew_position || '',

            blockMinutes:
                flight?.block_minutes ?? null,

            direction:
                flight
                    ? routeDirection(
                        flight,
                        this.homebase
                    )
                    : ''
        };

        for (
            const [
                id,
                value
            ] of Object.entries(values)
        ) {
            await this.setStateAsync(
                `next.${id}`,
                value,
                true
            );
        }
    }
}

if (require.main !== module) {
    module.exports =
        options =>
            new OpenAirLog(options);
} else {
    (() => new OpenAirLog())();
}
