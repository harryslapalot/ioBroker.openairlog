'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeHomebase,
    isHomebase,
    getDepartureTime,
    getArrivalTime,
    parseTimeToSeconds,
    parseFlightNumber,
    sortFlights,
    routeDirection,
    isOutboundFlight,
    isInboundFlight,
    summarizeDay,
    findNextFlight,
    getHomebaseAction,
    getCurrentLocation
} = require('../lib/flightLogic');


test('normalizes homebase', () => {
    assert.equal(
        normalizeHomebase('eddf'),
        'EDDF'
    );

    assert.equal(
        normalizeHomebase(' MUC '),
        'MUC'
    );

    assert.equal(
        normalizeHomebase(''),
        'EDDF'
    );
});


test('recognizes homebase', () => {
    assert.equal(
        isHomebase('EDDF', 'EDDF'),
        true
    );

    assert.equal(
        isHomebase('eddf', 'EDDF'),
        true
    );

    assert.equal(
        isHomebase('MUC', 'EDDF'),
        false
    );

    assert.equal(
        isHomebase('MUC', 'MUC'),
        true
    );
});


test('uses scheduled times first', () => {
    const flight = {
        scheduled_off_block: '10:00:00',
        off_block: '10:05',
        scheduled_on_block: '12:00:00',
        on_block: '12:05'
    };

    assert.equal(
        getDepartureTime(flight),
        '10:00:00'
    );

    assert.equal(
        getArrivalTime(flight),
        '12:00:00'
    );
});


test('uses actual block times as fallback', () => {
    const flight = {
        scheduled_off_block: null,
        off_block: '10:05',
        scheduled_on_block: null,
        on_block: '12:05'
    };

    assert.equal(
        getDepartureTime(flight),
        '10:05'
    );

    assert.equal(
        getArrivalTime(flight),
        '12:05'
    );
});


test('parses flight numbers', () => {
    assert.equal(
        parseFlightNumber('LH498'),
        498
    );

    assert.equal(
        parseFlightNumber('LH499'),
        499
    );
});


test('parses times', () => {
    assert.equal(
        parseTimeToSeconds('00:00:00'),
        0
    );

    assert.equal(
        parseTimeToSeconds('01:30:00'),
        5400
    );

    assert.equal(
        parseTimeToSeconds('23:59:59'),
        86399
    );
});


test('sorts flights by date and departure time', () => {
    const flights = [
        {
            date: '2026-08-28',
            flight_number: 'LH2',
            scheduled_off_block: '15:00:00'
        },
        {
            date: '2026-08-28',
            flight_number: 'LH1',
            scheduled_off_block: '07:00:00'
        },
        {
            date: '2026-08-29',
            flight_number: 'LH3',
            scheduled_off_block: '06:00:00'
        }
    ];

    const sorted =
        sortFlights(flights);

    assert.deepEqual(
        sorted.map(
            flight =>
                flight.flight_number
        ),
        [
            'LH1',
            'LH2',
            'LH3'
        ]
    );
});


test('detects outbound and inbound flights for Frankfurt', () => {
    const outbound = {
        flight_number: 'LH498',
        departure: 'EDDF',
        arrival: 'MMMX'
    };

    const inbound = {
        flight_number: 'LH499',
        departure: 'MMMX',
        arrival: 'EDDF'
    };

    assert.equal(
        routeDirection(
            outbound,
            'EDDF'
        ),
        'outbound'
    );

    assert.equal(
        routeDirection(
            inbound,
            'EDDF'
        ),
        'inbound'
    );

    assert.equal(
        isOutboundFlight(
            outbound,
            'EDDF'
        ),
        true
    );

    assert.equal(
        isInboundFlight(
            inbound,
            'EDDF'
        ),
        true
    );
});


test('supports Munich as configurable homebase', () => {
    const outbound = {
        flight_number: 'LH100',
        departure: 'MUC',
        arrival: 'LHR'
    };

    const inbound = {
        flight_number: 'LH101',
        departure: 'LHR',
        arrival: 'MUC'
    };

    assert.equal(
        routeDirection(
            outbound,
            'MUC'
        ),
        'outbound'
    );

    assert.equal(
        routeDirection(
            inbound,
            'MUC'
        ),
        'inbound'
    );
});


test('summarizes a Frankfurt rotation', () => {
    const flights = [
        {
            date: '2026-08-29',
            flight_number: 'LH498',
            departure: 'EDDF',
            arrival: 'HAM',
            scheduled_off_block: '10:00:00',
            scheduled_on_block: '11:00:00'
        },
        {
            date: '2026-08-29',
            flight_number: 'LH499',
            departure: 'HAM',
            arrival: 'EDDF',
            scheduled_off_block: '12:00:00',
            scheduled_on_block: '13:00:00'
        }
    ];

    const summary =
        summarizeDay(
            flights,
            '2026-08-29',
            'EDDF'
        );

    assert.equal(
        summary.flightCount,
        2
    );

    assert.equal(
        summary.first.flight_number,
        'LH498'
    );

    assert.equal(
        summary.last.flight_number,
        'LH499'
    );

    assert.equal(
        summary.startsInHomebase,
        true
    );

    assert.equal(
        summary.endsInHomebase,
        true
    );

    assert.equal(
        summary.isOutbound,
        true
    );

    assert.equal(
        summary.isInbound,
        true
    );

    assert.equal(
        summary.direction,
        'rotation'
    );
});


test('finds the remaining flight today before tomorrow', () => {
    const flights = [
        {
            date: '2026-08-29',
            flight_number: 'LH123',
            departure: 'EDDF',
            arrival: 'EDDH',
            scheduled_off_block: '19:00:00'
        },
        {
            date: '2026-08-30',
            flight_number: 'LH456',
            departure: 'EDDF',
            arrival: 'MUC',
            scheduled_off_block: '08:00:00'
        }
    ];

    const next =
        findNextFlight(
            flights,
            '2026-08-29',
            parseTimeToSeconds('18:00:00')
        );

    assert.equal(
        next.flight_number,
        'LH123'
    );
});


test('finds tomorrow when no flight remains today', () => {
    const flights = [
        {
            date: '2026-08-29',
            flight_number: 'LH123',
            departure: 'EDDF',
            arrival: 'EDDH',
            scheduled_off_block: '10:00:00'
        },
        {
            date: '2026-08-30',
            flight_number: 'LH456',
            departure: 'MMMX',
            arrival: 'EDDF',
            scheduled_off_block: '01:50:00'
        }
    ];

    const next =
        findNextFlight(
            flights,
            '2026-08-29',
            parseTimeToSeconds('18:00:00')
        );

    assert.equal(
        next.flight_number,
        'LH456'
    );

    assert.equal(
        next.date,
        '2026-08-30'
    );
});


test('returns no next flight when nothing is available', () => {
    const flights = [
        {
            date: '2026-08-29',
            flight_number: 'LH123',
            departure: 'EDDF',
            arrival: 'EDDH',
            scheduled_off_block: '10:00:00'
        }
    ];

    const next =
        findNextFlight(
            flights,
            '2026-08-29',
            parseTimeToSeconds('18:00:00')
        );

    assert.equal(
        next,
        null
    );
});


test('homebaseAction is outbound when another homebase departure remains', () => {
    const flights = [
        {
            date: '2026-08-29',
            flight_number: 'LH123',
            departure: 'EDDF',
            arrival: 'HAM',
            scheduled_off_block: '10:00:00'
        },
        {
            date: '2026-08-29',
            flight_number: 'LH124',
            departure: 'HAM',
            arrival: 'EDDF',
            scheduled_off_block: '12:00:00'
        },
        {
            date: '2026-08-29',
            flight_number: 'LH125',
            departure: 'EDDF',
            arrival: 'BEG',
            scheduled_off_block: '20:30:00'
        }
    ];

    assert.equal(
        getHomebaseAction(
            flights,
            '2026-08-29',
            'EDDF',
            parseTimeToSeconds('18:00:00')
        ),
        'outbound'
    );
});


test('homebaseAction is inbound when the last flight returns home', () => {
    const flights = [
        {
            date: '2026-08-29',
            flight_number: 'LH123',
            departure: 'EDDF',
            arrival: 'HAM',
            scheduled_off_block: '10:00:00'
        },
        {
            date: '2026-08-29',
            flight_number: 'LH124',
            departure: 'HAM',
            arrival: 'EDDF',
            scheduled_off_block: '12:00:00'
        }
    ];

    assert.equal(
        getHomebaseAction(
            flights,
            '2026-08-29',
            'EDDF',
            parseTimeToSeconds('14:00:00')
        ),
        'inbound'
    );
});


test('current location remains Mexico after arriving there', () => {
    const flights = [
        {
            date: '2026-08-28',
            flight_number: 'LH498',
            departure: 'EDDF',
            arrival: 'MMMX',
            scheduled_off_block: '10:00:00',
            scheduled_on_block: '20:00:00'
        }
    ];

    const result =
        getCurrentLocation(
            flights,
            new Date(
                '2026-08-29T12:00:00Z'
            )
        );

    assert.equal(
        result.location,
        'MMMX'
    );

    assert.equal(
        result.flight.flight_number,
        'LH498'
    );
});


test('current location is Frankfurt after returning home', () => {
    const flights = [
        {
            date: '2026-08-28',
            flight_number: 'LH498',
            departure: 'EDDF',
            arrival: 'MMMX',
            scheduled_off_block: '10:00:00',
            scheduled_on_block: '20:00:00'
        },
        {
            date: '2026-08-29',
            flight_number: 'LH499',
            departure: 'MMMX',
            arrival: 'EDDF',
            scheduled_off_block: '01:50:00',
            scheduled_on_block: '12:50:00'
        }
    ];

    const result =
        getCurrentLocation(
            flights,
            new Date(
                '2026-08-29T14:00:00Z'
            )
        );

    assert.equal(
        result.location,
        'EDDF'
    );

    assert.equal(
        result.flight.flight_number,
        'LH499'
    );
});


test('handles a flight crossing midnight', () => {
    const flights = [
        {
            date: '2026-08-28',
            flight_number: 'LH498',
            departure: 'EDDF',
            arrival: 'MMMX',
            scheduled_off_block: '23:00:00',
            scheduled_on_block: '01:30:00'
        }
    ];

    /*
     * At 00:30 UTC on the following day the flight
     * has departed but has not arrived yet.
     */
    const airborne =
        getCurrentLocation(
            flights,
            new Date(
                '2026-08-29T00:30:00Z'
            )
        );

    assert.equal(
        airborne.location,
        'EDDF'
    );

    /*
     * At 02:00 UTC the arrival time has passed.
     */
    const arrived =
        getCurrentLocation(
            flights,
            new Date(
                '2026-08-29T02:00:00Z'
            )
        );

    assert.equal(
        arrived.location,
        'MMMX'
    );
});


test('current location can be determined even when today has no flights', () => {
    const historicalFlights = [
        {
            date: '2026-08-28',
            flight_number: 'LH498',
            departure: 'EDDF',
            arrival: 'MMMX',
            scheduled_off_block: '10:00:00',
            scheduled_on_block: '20:00:00'
        }
    ];

    const result =
        getCurrentLocation(
            historicalFlights,
            new Date(
                '2026-08-29T12:00:00Z'
            )
        );

    assert.equal(
        result.location,
        'MMMX'
    );
});


test('current location follows the latest completed flight', () => {
    const flights = [
        {
            date: '2026-08-27',
            flight_number: 'LH100',
            departure: 'EDDF',
            arrival: 'LHR',
            scheduled_off_block: '08:00:00',
            scheduled_on_block: '09:00:00'
        },
        {
            date: '2026-08-27',
            flight_number: 'LH101',
            departure: 'LHR',
            arrival: 'CDG',
            scheduled_off_block: '10:00:00',
            scheduled_on_block: '11:00:00'
        },
        {
            date: '2026-08-28',
            flight_number: 'LH102',
            departure: 'CDG',
            arrival: 'MMMX',
            scheduled_off_block: '12:00:00',
            scheduled_on_block: '20:00:00'
        }
    ];

    const result =
        getCurrentLocation(
            flights,
            new Date(
                '2026-08-29T12:00:00Z'
            )
        );

    assert.equal(
        result.location,
        'MMMX'
    );

    assert.equal(
        result.flight.flight_number,
        'LH102'
    );
});