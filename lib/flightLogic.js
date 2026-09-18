'use strict';

/**
 * OpenAirLog flight logic.
 *
 * IMPORTANT:
 * OpenAirLog's `date` is the UTC departure date.
 * It must not be changed to the arrival date.
 *
 * Time handling:
 * - scheduled_off_block is preferred for future flights
 * - off_block is used as fallback
 * - scheduled_on_block is preferred for future arrivals
 * - on_block is used as fallback
 *
 * A record is considered a flight ONLY when
 * a flight number is present.
 */

function hasFlightNumber(flight) {
    return Boolean(
        String(
            flight?.flight_number ?? ''
        ).trim()
    );
}

function filterFlights(flights) {
    return (flights || []).filter(
        hasFlightNumber
    );
}

function normalizeAirport(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeHomebase(value) {
    const homebase = normalizeAirport(value);
    return homebase || 'EDDF';
}

function isHomebase(value, homebase) {
    return (
        normalizeAirport(value) ===
        normalizeHomebase(homebase)
    );
}

function getDepartureTime(flight) {
    return (
        flight?.scheduled_off_block ||
        flight?.off_block ||
        null
    );
}

function getArrivalTime(flight) {
    return (
        flight?.scheduled_on_block ||
        flight?.on_block ||
        null
    );
}

function flightSortKey(flight) {
    return [
        flight?.date || '',
        getDepartureTime(flight) || '99:99:99',
        String(flight?.id ?? '')
    ].join('T');
}

function sortFlights(flights) {
    return [...filterFlights(flights)].sort(
        (a, b) =>
            flightSortKey(a)
                .localeCompare(
                    flightSortKey(b)
                )
    );
}

function parseTimeToSeconds(value) {
    const match =
        String(value || '').match(
            /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
        );

    if (!match) {
        return null;
    }

    return (
        Number(match[1]) * 3600 +
        Number(match[2]) * 60 +
        Number(match[3] || 0)
    );
}

function parseFlightNumber(value) {
    const match =
        String(value ?? '').match(
            /(\d+)\s*$/
        );

    return match
        ? Number(match[1])
        : null;
}

function routeDirection(
    flight,
    homebase
) {
    if (!flight) {
        return 'unknown';
    }

    const departureHomebase =
        isHomebase(
            flight.departure,
            homebase
        );

    const arrivalHomebase =
        isHomebase(
            flight.arrival,
            homebase
        );

    if (
        departureHomebase &&
        !arrivalHomebase
    ) {
        return 'outbound';
    }

    if (
        !departureHomebase &&
        arrivalHomebase
    ) {
        return 'inbound';
    }

    if (
        departureHomebase &&
        arrivalHomebase
    ) {
        return 'homebase';
    }

    return 'enroute';
}

function isOutboundFlight(
    flight,
    homebase
) {
    return (
        isHomebase(
            flight?.departure,
            homebase
        ) &&
        !isHomebase(
            flight?.arrival,
            homebase
        )
    );
}

function isInboundFlight(
    flight,
    homebase
) {
    return (
        !isHomebase(
            flight?.departure,
            homebase
        ) &&
        isHomebase(
            flight?.arrival,
            homebase
        )
    );
}

function getFirstFlightOfDate(
    flights,
    date
) {
    return (
        sortFlights(flights)
            .filter(
                flight =>
                    flight?.date === date
            )[0] ||
        null
    );
}

function getLastFlightOfDate(
    flights,
    date
) {
    const flightsOfDate =
        sortFlights(flights)
            .filter(
                flight =>
                    flight?.date === date
            );

    return flightsOfDate.at(-1) || null;
}

function endsAtHomebase(
    flights,
    date,
    homebase
) {
    const last =
        getLastFlightOfDate(
            flights,
            date
        );

    return Boolean(
        last &&
        isInboundFlight(
            last,
            homebase
        )
    );
}

function startsAtHomebase(
    flights,
    date,
    homebase
) {
    const first =
        getFirstFlightOfDate(
            flights,
            date
        );

    return Boolean(
        first &&
        isOutboundFlight(
            first,
            homebase
        )
    );
}

function summarizeDay(
    flights,
    date,
    homebase
) {
    const sorted =
        sortFlights(flights)
            .filter(
                flight =>
                    flight?.date === date
            );

    const first =
        sorted[0] || null;

    const last =
        sorted.at(-1) || null;

    const startsInHomebase =
        Boolean(
            first &&
            isOutboundFlight(
                first,
                homebase
            )
        );

    const endsInHomebase =
        Boolean(
            last &&
            isInboundFlight(
                last,
                homebase
            )
        );

    return {
        flights: sorted,

        first,

        last,

        flightCount:
            sorted.length,

        startsInHomebase,

        endsInHomebase,

        isOutbound:
            startsInHomebase,

        isInbound:
            endsInHomebase,

        direction:
            startsInHomebase &&
            endsInHomebase
                ? 'rotation'
                : startsInHomebase
                    ? 'outbound'
                    : endsInHomebase
                        ? 'inbound'
                        : 'none'
    };
}

/**
 * Returns the next flight that has not yet started.
 *
 * Today's remaining flights ALWAYS have priority.
 *
 * Only when there are no remaining flights today
 * will a flight on a later UTC date be selected.
 */
function findNextFlight(
    flights,
    currentDate,
    currentSeconds
) {
    const sorted =
        sortFlights(flights);

    const todayNext =
        sorted.find(flight => {

            if (
                flight?.date !==
                currentDate
            ) {
                return false;
            }

            const departureSeconds =
                parseTimeToSeconds(
                    getDepartureTime(
                        flight
                    )
                );

            if (
                departureSeconds === null
            ) {
                return false;
            }

            return (
                departureSeconds >
                currentSeconds
            );
        });

    if (todayNext) {
        return todayNext;
    }

    return (
        sorted.find(flight => {

            return (
                flight?.date &&
                flight.date >
                    currentDate
            );
        }) ||
        null
    );
}

/**
 * Determine the action when the user
 * is at the homebase.
 */
function getHomebaseAction(
    flights,
    date,
    homebase,
    currentSeconds
) {
    const sorted =
        sortFlights(flights)
            .filter(
                flight =>
                    flight?.date === date
            );

    if (!sorted.length) {
        return 'none';
    }

    const futureHomebaseDeparture =
        sorted.find(flight => {

            const departureSeconds =
                parseTimeToSeconds(
                    getDepartureTime(
                        flight
                    )
                );

            return (
                departureSeconds !== null &&
                departureSeconds >
                    currentSeconds &&
                isOutboundFlight(
                    flight,
                    homebase
                )
            );
        });

    if (
        futureHomebaseDeparture
    ) {
        return 'outbound';
    }

    const last =
        sorted.at(-1);

    if (
        last &&
        isInboundFlight(
            last,
            homebase
        )
    ) {
        const arrivalSeconds =
            parseTimeToSeconds(
                getArrivalTime(
                    last
                )
            );

        if (
            arrivalSeconds !== null &&
            arrivalSeconds >
                currentSeconds
        ) {
            return 'none';
        }

        return 'inbound';
    }

    return 'none';
}

/**
 * Determine the flight currently in progress.
 *
 * IMPORTANT:
 * This deliberately uses the PLANNE​D times
 * scheduled_off_block and scheduled_on_block.
 *
 * A flight is current when:
 *
 *     scheduled off-block <= now
 *     scheduled on-block  >  now
 *
 * The flight's `date` is its UTC departure date.
 *
 * Flights from yesterday are also checked because
 * a flight can cross UTC midnight.
 */
function getCurrentFlight(
    flights,
    now = new Date()
) {
    const sorted =
        sortFlights(flights);

    const nowMs =
        now.getTime();

    for (
        const flight of sorted
    ) {
        if (
            !hasFlightNumber(flight) ||
            !flight?.date ||
            !flight?.scheduled_off_block ||
            !flight?.scheduled_on_block
        ) {
            continue;
        }

        const departureSeconds =
            parseTimeToSeconds(
                flight.scheduled_off_block
            );

        const arrivalSeconds =
            parseTimeToSeconds(
                flight.scheduled_on_block
            );

        if (
            departureSeconds === null ||
            arrivalSeconds === null
        ) {
            continue;
        }

        const departureMs =
            Date.parse(
                `${flight.date}T${flight.scheduled_off_block}Z`
            );

        if (
            Number.isNaN(departureMs)
        ) {
            continue;
        }

        let arrivalDate =
            flight.date;

        /*
         * Flight crosses UTC midnight.
         */
        if (
            arrivalSeconds <
            departureSeconds
        ) {
            const nextDate =
                new Date(
                    `${flight.date}T00:00:00Z`
                );

            nextDate.setUTCDate(
                nextDate.getUTCDate() + 1
            );

            arrivalDate =
                nextDate
                    .toISOString()
                    .slice(0, 10);
        }

        const arrivalMs =
            Date.parse(
                `${arrivalDate}T${flight.scheduled_on_block}Z`
            );

        if (
            Number.isNaN(arrivalMs)
        ) {
            continue;
        }

        if (
            departureMs <= nowMs &&
            arrivalMs > nowMs
        ) {
            return flight;
        }
    }

    return null;
}

/**
 * Determine the current location from the
 * complete flight history available to the adapter.
 */
function getCurrentLocation(
    flights,
    now = new Date()
) {
    const sorted =
        sortFlights(flights);

    const nowMs =
        now.getTime();

    let currentLocation = null;
    let currentFlight = null;

    for (
        const flight of sorted
    ) {
        if (
            !flight?.date ||
            !flight?.departure
        ) {
            continue;
        }

        const departureTime =
            getDepartureTime(
                flight
            );

        if (!departureTime) {
            continue;
        }

        const departureSeconds =
            parseTimeToSeconds(
                departureTime
            );

        if (
            departureSeconds === null
        ) {
            continue;
        }

        const departureMs =
            Date.parse(
                `${flight.date}T${departureTime}Z`
            );

        if (
            Number.isNaN(
                departureMs
            )
        ) {
            continue;
        }

        if (
            departureMs > nowMs
        ) {
            break;
        }

        currentFlight =
            flight;

        const arrivalTime =
            getArrivalTime(
                flight
            );

        if (!arrivalTime) {
            currentLocation =
                flight.departure;

            continue;
        }

        const arrivalSeconds =
            parseTimeToSeconds(
                arrivalTime
            );

        if (
            arrivalSeconds === null
        ) {
            currentLocation =
                flight.departure;

            continue;
        }

        let arrivalDate =
            flight.date;

        if (
            arrivalSeconds <
            departureSeconds
        ) {
            const nextDate =
                new Date(
                    `${flight.date}T00:00:00Z`
                );

            nextDate.setUTCDate(
                nextDate.getUTCDate() + 1
            );

            arrivalDate =
                nextDate
                    .toISOString()
                    .slice(0, 10);
        }

        const arrivalMs =
            Date.parse(
                `${arrivalDate}T${arrivalTime}Z`
            );

        if (
            Number.isNaN(
                arrivalMs
            )
        ) {
            currentLocation =
                flight.departure;

            continue;
        }

        if (
            arrivalMs <= nowMs
        ) {
            currentLocation =
                flight.arrival ||
                flight.departure;

            continue;
        }

        currentLocation =
            flight.departure;

        break;
    }

    return {
        location:
            currentLocation,

        flight:
            currentFlight
    };
}

module.exports = {
    hasFlightNumber,
    filterFlights,

    normalizeAirport,
    normalizeHomebase,
    isHomebase,

    getDepartureTime,
    getArrivalTime,

    flightSortKey,
    sortFlights,

    parseTimeToSeconds,
    parseFlightNumber,

    routeDirection,

    isOutboundFlight,
    isInboundFlight,

    getFirstFlightOfDate,
    getLastFlightOfDate,

    endsAtHomebase,
    startsAtHomebase,

    summarizeDay,

    findNextFlight,
    getHomebaseAction,

    getCurrentFlight,
    getCurrentLocation
};
