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

/**
 * Route based direction.
 *
 * Homebase -> destination = outbound
 * Destination -> homebase = inbound
 * Other route = enroute
 */
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

/**
 * Returns the first flight of a given OpenAirLog UTC date.
 */
function getFirstFlightOfDate(flights, date) {
    return sortFlights(flights)
        .filter(flight => flight?.date === date)[0] || null;
}

/**
 * Returns the last flight of a given OpenAirLog UTC date.
 */
function getLastFlightOfDate(flights, date) {
    const flightsOfDate = sortFlights(flights)
        .filter(flight => flight?.date === date);

    return flightsOfDate.at(-1) || null;
}

/**
 * Does the day's final flight return to the homebase?
 */
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

/**
 * Does the day's first flight leave the homebase?
 */
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

/**
 * Summarize all flights belonging to one OpenAirLog UTC date.
 */
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
 * Find the next scheduled flight after the supplied moment.
 *
 * `date` is the OpenAirLog UTC departure date.
 * `currentDate` must therefore also be an OpenAirLog UTC date.
 *
 * currentSeconds is the current UTC time of that date.
 */
function findNextFlight(
    flights,
    currentDate,
    currentSeconds
) {
    return sortFlights(flights).find(flight => {
        if (!flight?.date) {
            return false;
        }

        if (flight.date > currentDate) {
            return true;
        }

        if (flight.date < currentDate) {
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
    }) || null;
}

/**
 * Determine the action when the user's GPS says:
 *
 * "I am currently at my homebase."
 *
 * The important distinction is between:
 *
 * 1. The first departure of the duty.
 * 2. An intermediate return to homebase.
 * 3. The final return to homebase.
 *
 * Example:
 *
 * EDDF -> EDDM
 * EDDM -> EDDF
 * EDDF -> EDDN
 *
 * At the first EDDF visit:
 *     outbound
 *
 * At the intermediate EDDF visit:
 *     none
 *
 * At no point is that intermediate return considered inbound.
 *
 * Example:
 *
 * EDDF -> EDDM
 * EDDM -> EDDF
 *
 * After the final return:
 *     inbound
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
     * Find flights which have not yet departed.
     */
    const futureFlights = sorted.filter(flight => {
        const departureSeconds =
            parseTimeToSeconds(
                flight.scheduled_off_block
            );

        if (departureSeconds === null) {
            return false;
        }

        return departureSeconds > currentSeconds;
    });

    /*
     * If there is a future flight departing from homebase,
     * the GPS visit can represent the outbound start of
     * that next sector.
     *
     * Example:
     *
     * 09:00 EDDF -> EDDM
     * 11:00 EDDM -> EDDF
     * 13:00 EDDF -> EDDN
     *
     * At 11:30:
     * next flight = EDDF -> EDDN
     * therefore the current EDDF visit is outbound.
     */
    const nextHomebaseDeparture =
        futureFlights.find(
            flight =>
                isOutboundFlight(
                    flight,
                    homebase
                )
        );

    /*
     * If there is a future homebase departure,
     * outbound has priority.
     *
     * This prevents an intermediate return to the
     * homebase from being classified as inbound.
     */
    if (nextHomebaseDeparture) {
        return 'outbound';
    }

    /*
     * No future homebase departure exists.
     *
     * If the last flight of the date returns to homebase,
     * the next/current homebase visit is the final return.
     */
    const last = sorted.at(-1);

    if (
        last &&
        isInboundFlight(last, homebase)
    ) {
        const lastArrivalSeconds =
            parseTimeToSeconds(
                last.scheduled_on_block
            );

        /*
         * If an on-block time is available and the aircraft
         * has not yet reached it, this is not yet the inbound
         * event.
         */
        if (
            lastArrivalSeconds !== null &&
            lastArrivalSeconds > currentSeconds
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