'use strict';

/**
 * OpenAirLog:
 * `date` is the UTC calendar date on which the flight departs.
 *
 * The flight date must therefore NOT be changed based on the
 * arrival time. A flight may arrive on the following calendar
 * day and still belongs to the departure date returned by OAL.
 */

function normalizeAirport(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeHomebase(value) {
    return normalizeAirport(value) || 'EDDF';
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

function parseFlightNumber(value) {
    const match = String(value ?? '').match(/(\d+)\s*$/);
    return match ? Number(match[1]) : null;
}

/**
 * Route-based direction.
 *
 * Homebase -> airport = outbound
 * Airport -> homebase = inbound
 * Anything else = enroute
 */
function routeDirection(flight, homebase) {
    if (!flight) {
        return 'unknown';
    }

    const departureIsHomebase =
        isHomebase(flight.departure, homebase);

    const arrivalIsHomebase =
        isHomebase(flight.arrival, homebase);

    if (departureIsHomebase && !arrivalIsHomebase) {
        return 'outbound';
    }

    if (!departureIsHomebase && arrivalIsHomebase) {
        return 'inbound';
    }

    if (
        departureIsHomebase &&
        arrivalIsHomebase
    ) {
        return 'homebase';
    }

    return 'enroute';
}

/**
 * Returns true if the flight departs from the homebase.
 */
function isOutboundFlight(flight, homebase) {
    return (
        isHomebase(flight?.departure, homebase) &&
        !isHomebase(flight?.arrival, homebase)
    );
}

/**
 * Returns true if the flight arrives at the homebase.
 */
function isInboundFlight(flight, homebase) {
    return (
        !isHomebase(flight?.departure, homebase) &&
        isHomebase(flight?.arrival, homebase)
    );
}

/**
 * Find the last flight of the OpenAirLog UTC departure date.
 *
 * IMPORTANT:
 * This uses the OAL `date` field as supplied by the API.
 * No conversion to local arrival date is performed.
 */
function getLastFlightOfDate(flights, date) {
    return sortFlights(flights)
        .filter(flight => flight?.date === date)
        .at(-1) || null;
}

/**
 * Determine whether the day's final flight returns to homebase.
 *
 * This is the important part for short-haul rotations:
 *
 * EDDF -> X
 * X    -> EDDF
 * EDDF -> Y
 *
 * does NOT count as inbound because the final flight leaves
 * the homebase again.
 *
 * EDDF -> X
 * X    -> EDDF
 *
 * DOES count as inbound.
 */
function endsAtHomebase(flights, date, homebase) {
    const last = getLastFlightOfDate(flights, date);

    return Boolean(
        last &&
        isInboundFlight(last, homebase)
    );
}

/**
 * Determine the beginning of the duty/rotation.
 */
function startsAtHomebase(flights, date, homebase) {
    const first =
        sortFlights(flights)
            .filter(flight => flight?.date === date)
            .at(0) || null;

    return Boolean(
        first &&
        isOutboundFlight(first, homebase)
    );
}

/**
 * Summarize one OpenAirLog UTC departure date.
 */
function summarizeDay(flights, date, homebase) {
    const sorted =
        sortFlights(flights)
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

    /*
     * An outbound exists when the duty starts at homebase.
     */
    const isOutbound =
        startsInHomebase;

    /*
     * An inbound is ONLY true when the final flight
     * of the OAL departure date returns to homebase.
     *
     * Earlier returns during a short-haul rotation
     * are intentionally ignored.
     */
    const isInbound =
        endsInHomebase;

    return {
        flights: sorted,
        first,
        last,
        flightCount: sorted.length,

        startsInHomebase,
        endsInHomebase,

        isOutbound,
        isInbound,

        direction:
            isOutbound && isInbound
                ? 'rotation'
                : isOutbound
                    ? 'outbound'
                    : isInbound
                        ? 'inbound'
                        : 'none'
    };
}

/**
 * Determine the action to use when the GPS trigger says:
 * "I am at my homebase."
 *
 * The action is based on the actual route:
 *
 * - If the next homebase movement is a departure:
 *     outbound
 *
 * - If the final movement of the day is a return:
 *     inbound
 *
 * - Otherwise:
 *     none
 */
function getHomebaseAction(
    flights,
    date,
    homebase
) {
    const summary =
        summarizeDay(
            flights,
            date,
            homebase
        );

    if (!summary.flightCount) {
        return 'none';
    }

    /*
     * If the final flight returns to homebase,
     * arriving at the homebase is an inbound event.
     *
     * This deliberately takes precedence over the
     * fact that the same day may also have started
     * with an outbound.
     */
    if (summary.endsInHomebase) {
        return 'inbound';
    }

    /*
     * If the day's first flight starts at homebase
     * and the day does not end with a return, the
     * relevant homebase event is outbound.
     */
    if (summary.startsInHomebase) {
        return 'outbound';
    }

    return 'none';
}

module.exports = {
    normalizeAirport,
    normalizeHomebase,
    isHomebase,
    flightSortKey,
    sortFlights,
    parseFlightNumber,
    routeDirection,
    isOutboundFlight,
    isInboundFlight,
    getLastFlightOfDate,
    endsAtHomebase,
    startsAtHomebase,
    summarizeDay,
    getHomebaseAction
};