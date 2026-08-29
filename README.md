# ioBroker.openairlog

ioBroker adapter for reading flight data from the OpenAirLog REST API.

> **Test version:** This adapter is currently intended for testing. Please report bugs, unexpected behavior, or suggestions through the GitHub repository.

## Features

- Reads the user's flights from OpenAirLog.
- Detects whether there are flights on the current UTC date.
- Uses the OpenAirLog `date` field as the flight's departure date. The date is not changed when a flight arrives after midnight.
- Supports a configurable homebase using a four-letter ICAO airport code.
- Determines outbound/inbound from the actual route rather than flight-number parity.
- Provides `today.homebaseAction` for use with GPS-based automations.
- Handles short-haul rotations with multiple visits to the homebase.
- Provides the next upcoming flight. Remaining flights today always have priority over flights on following days.
- Provides aircraft type, registration, crew position and block time for today's flights and the next flight.
- Automatically removes obsolete `today.flights.X` objects when the number of flights changes.
- Uses only the read-only OpenAirLog `flights:read` API scope.

## Installation

### Manual installation for testing

The adapter can currently be tested directly from this GitHub repository.

1. Download or clone the repository.
2. Install the dependencies with:

```bash
npm install