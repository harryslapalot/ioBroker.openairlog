'use strict';

function flightSortKey(flight) {
    return `${flight.date || ''}T${flight.scheduled_off_block || '99:99:99'}`;
}

function sortFlights(flights) {
    return [...flights].sort((a, b) =>
        flightSortKey(a).localeCompare(flightSortKey(b))
    );
}

function parseFlightNumber(value) {
    const match = String(value ?? '').match(/(\d+)\s*$/);

    return match
        ? Number(match[1])
        : null;
}

function directionForFlight(
    flight,
    evenIsOutbound = true
) {
    const number = parseFlightNumber(
        flight?.flight_number
    );

    if (number === null) {
        return 'unknown';
    }

    const even = number % 2 === 0;

    return even === evenIsOutbound
        ? 'outbound'
        : 'inbound';
}

function isFrankfurt(code) {
    return String(code || '').toUpperCase() === 'EDDF';
}

function summarizeDay(
    flights,
    evenIsOutbound = true
) {
    const sorted = sortFlights(flights);

    const first = sorted[0] || null;
    const last =
        sorted[sorted.length - 1] || null;

    const directions = sorted.map(
        flight =>
            directionForFlight(
                flight,
                evenIsOutbound
            )
    );

    const hasOutbound =
        directions.includes('outbound');

    const hasInbound =
        directions.includes('inbound');

    return {
        flights: sorted,

        first,

        last,

        flightCount: sorted.length,

        /*
         * Starts in Frankfurt:
         * The first flight of the day departs EDDF.
         */
        startsInFrankfurt:
            Boolean(
                first &&
                isFrankfurt(first.departure)
            ),

        /*
         * Ends in Frankfurt:
         * The LAST flight of the day arrives at EDDF.
         *
         * This is deliberately based on the final
         * scheduled flight, not on the parity of the
         * flight number.
         */
        endsInFrankfurt:
            Boolean(
                last &&
                isFrankfurt(last.arrival)
            ),

        isOutbound:
            hasOutbound,

        isInbound:
            hasInbound,

        direction:
            hasOutbound && hasInbound
                ? 'rotation'
                : hasOutbound
                    ? 'outbound'
                    : hasInbound
                        ? 'inbound'
                        : 'unknown'
    };
}

module.exports = {
    flightSortKey,
    sortFlights,
    parseFlightNumber,
    directionForFlight,
    isFrankfurt,
    summarizeDay
};
