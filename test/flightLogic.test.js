'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseFlightNumber,
    directionForFlight,
    summarizeDay
} = require('../lib/flightLogic');


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


test('even flight number is outbound', () => {
    assert.equal(
        directionForFlight({
            flight_number: 'LH498'
        }),
        'outbound'
    );

    assert.equal(
        directionForFlight({
            flight_number: 'LH499'
        }),
        'inbound'
    );
});


test('detects Frankfurt at the end of the rotation', () => {

    const summary = summarizeDay([
        {
            date: '2026-08-28',
            flight_number: 'LH498',
            departure: 'EDDF',
            arrival: 'MMMX',
            scheduled_off_block: '11:30:00',
            scheduled_on_block: '23:30:00'
        },

        {
            date: '2026-08-28',
            flight_number: 'LH499',
            departure: 'MMMX',
            arrival: 'EDDF',
            scheduled_off_block: '23:59:00',
            scheduled_on_block: '13:30:00'
        }
    ]);


    assert.equal(
        summary.startsInFrankfurt,
        true
    );

    assert.equal(
        summary.endsInFrankfurt,
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


test('sorts flights by scheduled departure', () => {

    const summary = summarizeDay([
        {
            date: '2026-08-28',
            flight_number: 'LH2',
            departure: 'EDDF',
            arrival: 'AAAA',
            scheduled_off_block: '15:00:00'
        },

        {
            date: '2026-08-28',
            flight_number: 'LH1',
            departure: 'BBBB',
            arrival: 'EDDF',
            scheduled_off_block: '07:00:00'
        }
    ]);


    assert.equal(
        summary.first.flight_number,
        'LH1'
    );

    assert.equal(
        summary.last.flight_number,
        'LH2'
    );
});
