'use strict';

/**
 * OpenAirLog flight logic.
 *
 * IMPORTANT:
 * OpenAirLog's `date` is the UTC departure date.
 * It must not be changed to the arrival date.
 */

function normalizeAirport(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeHomebase(value) {
    const homebase = normalizeAirport(value);
    return homebase || 'EDDF';
}

function isHomebase(value, homebase) {
    return normalizeAirport(value) === normalizeHomebase(homebase);
}

function flightSortKey(flight) {
    return [
        flight?.date || '',
        flight?.scheduled_off_block || '99:99:99',
        String(flight?.id ?? '')
    ].join('T');
}

function sortFlights(flights) {
    return [...(flights || [])].sort((a, b) =>
        flightSortKey(a).localeCompare(flightSortKey(b))
    );
}

function parseTimeToSeconds(value) {
    const match = String(value || '').match(
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
    const match = String(value ?? '').match(/(\d+)\s*$/);
    return match ? Number(match[1]) : null;
}

function routeDirection(flight, homebase) {
    if (!flight) {
        return 'unknown';
    }

    const departureHomebase =
        isHomebase(flight.departure, homebase);

    const arrivalHomebase =
        isHomebase(flight.arrival, homebase);

    if (departureHomebase && !arrivalHomebase) {
        return 'outbound';
    }

    if (!departureHomebase && arrivalHomebase) {
        return 'inbound';
    }

    if (departureHomebase && arrivalHomebase) {
        return 'homebase';
    }

    return 'enroute';
}

function isOutboundFlight(flight, homebase) {
    return (
        isHomebase(flight?.departure, homebase) &&
        !isHomebase(flight?.arrival, homebase)
    );
}

function isInboundFlight(flight, homebase) {
    return (
        !isHomebase(flight?.departure, homebase) &&
        isHomebase(flight?.arrival, homebase)
    );
}

function getFirstFlightOfDate(flights, date) {
    return sortFlights(flights)
        .filter(flight => flight?.date === date)[0] || null;
}

function getLastFlightOfDate(flights, date) {
    const flightsOfDate = sortFlights(flights)
        .filter(flight => flight?.date === date);

    return flightsOfDate.at(-1) || null;
}

function endsAtHomebase(flights, date, homebase) {
    const last = getLastFlightOfDate(
        flights,
        date
    );

    return Boolean(
        last &&
        isInboundFlight(last, homebase)
    );
}

function startsAtHomebase(flights, date, homebase) {
    const first = getFirstFlightOfDate(
        flights,
        date
    );

    return Boolean(
        first &&
        isOutboundFlight(first, homebase)
    );
}

function summarizeDay(flights, date, homebase) {
    const sorted = sortFlights(flights)
        .filter(flight => flight?.date === date);

    const first = sorted[0] || null;
    const last = sorted.at(-1) || null;

    const startsInHomebase =
        Boolean(
            first &&
            isOutboundFlight(first, homebase)
        );

    const endsInHomebase =
        Boolean(
            last &&
            isInboundFlight(last, homebase)
        );

    return {
        flights: sorted,
        first,
        last,
        flightCount: sorted.length,

        startsInHomebase,
        endsInHomebase,

        isOutbound: startsInHomebase,
        isInbound: endsInHomebase,

        direction:
            startsInHomebase && endsInHomebase
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
 * Only when there are no remaining flights today
 * will a flight on a later UTC date be selected.
 */
function findNextFlight(
    flights,
    currentDate,
    currentSeconds
) {
    const sorted = sortFlights(flights);

    /*
     * First search today's remaining flights.
     */
    const todayNext = sorted.find(flight => {
        if (flight?.date !== currentDate) {
            return false;
        }

        const departureSeconds =
            parseTimeToSeconds(
                flight.scheduled_off_block
            );

        if (departureSeconds === null) {
            return false;
        }

        return departureSeconds > currentSeconds;
    });

    if (todayNext) {
        return todayNext;
    }

    /*
     * Nothing left today.
     * Now search for the first flight on a later date.
     */
    return sorted.find(flight => {
        return (
            flight?.date &&
            flight.date > currentDate
        );
    }) || null;
}

/**
 * Determine the action when the user is at the homebase.
 *
 * outbound:
 *   There is another departure from the homebase later today.
 *
 * inbound:
 *   The last flight of the day returns to the homebase
 *   and there is no later homebase departure.
 *
 * none:
 *   The homebase visit is only an intermediate stop or
 *   there is no applicable homebase action.
 */
function getHomebaseAction(
    flights,
    date,
    homebase,
    currentSeconds
) {
    const sorted = sortFlights(flights)
        .filter(flight => flight?.date === date);

    if (!sorted.length) {
        return 'none';
    }

    /*
     * If another flight leaves the homebase later today,
     * the current homebase visit belongs to the outbound
     * part of the next sector.
     */
    const futureHomebaseDeparture =
        sorted.find(flight => {
            const departureSeconds =
                parseTimeToSeconds(
                    flight.scheduled_off_block
                );

            return (
                departureSeconds !== null &&
                departureSeconds > currentSeconds &&
                isOutboundFlight(
                    flight,
                    homebase
                )
            );
        });

    if (futureHomebaseDeparture) {
        return 'outbound';
    }

    /*
     * No later departure from homebase.
     * Therefore a final return to homebase is inbound.
     */
    const last = sorted.at(-1);

    if (
        last &&
        isInboundFlight(
            last,
            homebase
        )
    ) {
        const arrivalSeconds =
            parseTimeToSeconds(
                last.scheduled_on_block
            );

        /*
         * If the scheduled arrival is still in the future,
         * the inbound event has not happened yet.
         */
        if (
            arrivalSeconds !== null &&
            arrivalSeconds > currentSeconds
        ) {
            return 'none';
        }

        return 'inbound';
    }

    return 'none';
}

module.exports = {
    normalizeAirport,
    normalizeHomebase,
    isHomebase,
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
    getHomebaseAction
};