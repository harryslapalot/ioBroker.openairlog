# ioBroker.openairlog

ioBroker adapter for reading flight data from the OpenAirLog REST API.

> **Test version:** This adapter is currently intended for testing. Please report bugs, unexpected behavior, or suggestions through the GitHub repository.

## Features

- Reads the user's flights from OpenAirLog.
- Detects whether there are flights on the current UTC date.
- Uses the OpenAirLog `date` field as the flight's departure date.
- Supports flights crossing midnight.
- Supports a configurable homebase using a four-letter ICAO airport code.
- Determines outbound/inbound from the actual route.
- Provides `today.homebaseAction` for GPS-based automations.
- Handles short-haul rotations with multiple visits to the homebase.
- Provides the next upcoming flight.
- Remaining flights today always have priority over flights on following days.
- Provides aircraft type, registration, crew position and block time.
- Determines the current location using historical flight data.
- Automatically removes obsolete `today.flights.X` objects when the number of flights changes.
- Uses only the read-only OpenAirLog `flights:read` API scope.

---

# Installation

## Manual installation for testing

The adapter can currently be tested directly from this GitHub repository.

1. Download or clone the repository.
2. Install the dependencies with `npm install`.
3. Install the adapter in ioBroker from the GitHub repository.
4. Open the adapter configuration.
5. Enter your OpenAirLog API key.
6. Configure your homebase.

---

# Configuration

## API Key

Your OpenAirLog API key.

The adapter only requires the read-only `flights:read` API permission.

## Homebase

The homebase is configured using the four-letter ICAO airport code.

Examples:

- `EDDF` — Frankfurt
- `EDDM` — Munich

The homebase is used for:

- outbound/inbound detection
- `homebaseAction`
- `isCurrentlyAway`
- `currentLocation`
- flight direction

## Poll interval

The adapter periodically requests updated flight data from OpenAirLog.

Minimum poll interval: **5 minutes**

Default poll interval: **15 minutes**

---

# Object structure

The adapter creates the following main object groups:

    openairlog.0
    ├── info
    ├── today
    │   └── flights
    └── next

---

# `info`

## `info.connection`

**Type:** boolean

Indicates whether the last API request was successful.

- `true` — API connection/request successful
- `false` — API request failed

## `info.lastUpdate`

**Type:** string

Contains the timestamp of the last successful API update.

The timestamp is stored as an ISO 8601 timestamp.

Example:

    2026-08-29T17:33:14.000Z

---

# `today`

The `today` states describe the flights belonging to the **current UTC date**.

Important:

The OpenAirLog `date` field is treated as the **UTC departure date**.

It is not changed when a flight arrives after midnight.

For example:

    date:       2026-08-29
    off_block: 23:30
    on_block:  01:30

is still a flight of:

    2026-08-29

The arrival is nevertheless correctly taken into account when determining the current location.

---

## `today.hasFlight`

**Type:** boolean

Indicates whether there are any flights on the current UTC date.

- `true` — at least one flight today
- `false` — no flights today

---

## `today.flightCount`

**Type:** number

Number of flights belonging to the current UTC date.

Example:

    3

---

## `today.homebase`

**Type:** string

Contains the currently configured homebase.

Example:

    EDDF

or:

    EDDM

---

## `today.homebaseAction`

**Type:** string

This state is intended primarily for GPS-based automations.

Possible values:

- `outbound`
- `inbound`
- `none`

### `outbound`

Indicates that a visit to the homebase should be treated as the start of another outbound sector.

Example:

    EDDF → HAM
    HAM → EDDF
    EDDF → BEG

When the GPS trigger detects arrival at EDDF after the HAM sector, the adapter identifies the subsequent EDDF → BEG flight and returns:

    outbound

### `inbound`

Indicates that the homebase visit represents the final return home for the day.

Example:

    EDDF → HAM
    HAM → EDDF

After returning to EDDF, there is no later departure from the homebase.

The state becomes:

    inbound

### `none`

No homebase action is currently applicable.

This is particularly important for short-haul rotations where the homebase is only an intermediate stop.

---

## `today.startsInHomebase`

**Type:** boolean

Indicates whether the first flight of today's rotation departs from the configured homebase.

Example:

    EDDF → HAM

returns:

    true

---

## `today.endsInHomebase`

**Type:** boolean

Indicates whether the last flight of today's rotation arrives at the configured homebase.

Example:

    HAM → EDDF

returns:

    true

---

## `today.isOutbound`

**Type:** boolean

Indicates whether today's rotation starts with an outbound flight from the homebase.

---

## `today.isInbound`

**Type:** boolean

Indicates whether today's rotation ends with an inbound flight to the homebase.

---

## `today.direction`

**Type:** string

Provides a simplified description of today's rotation.

Possible values:

- `outbound`
- `inbound`
- `rotation`
- `none`

For example:

    EDDF → HAM
    HAM → EDDF

results in:

    rotation

---

# First flight states

The following states describe the first flight of the current UTC day.

## `today.firstFlightNumber`

Flight number of the first flight.

Example:

    LH498

## `today.firstDeparture`

Departure airport of the first flight.

Example:

    EDDF

## `today.firstArrival`

Arrival airport of the first flight.

Example:

    MMMX

## `today.firstScheduledOffBlock`

Scheduled off-block time of the first flight.

If OpenAirLog does not provide a scheduled off-block time, the actual `off_block` value is used as a fallback.

## `today.firstScheduledOnBlock`

Scheduled on-block time of the first flight.

If OpenAirLog does not provide a scheduled on-block time, the actual `on_block` value is used as a fallback.

---

# Last flight states

The following states describe the last flight of the current UTC day.

## `today.lastFlightNumber`

Flight number of the last flight.

## `today.lastDeparture`

Departure airport of the last flight.

## `today.lastArrival`

Arrival airport of the last flight.

## `today.lastScheduledOffBlock`

Scheduled off-block time of the last flight.

Falls back to `off_block` if no scheduled value exists.

## `today.lastScheduledOnBlock`

Scheduled on-block time of the last flight.

Falls back to `on_block` if no scheduled value exists.

---

# Current location

## `today.currentLocation`

**Type:** string

Contains the airport at which the pilot is currently considered to be located.

The adapter uses historical flight data to determine the last known location.

This is important when there are no flights on the current day.

For example:

    2026-08-28
    EDDF → MMMX

After arrival in Mexico, the state can show:

    MMMX

even if there are no flights on:

    2026-08-29

The adapter therefore loads historical flight data in addition to today's flights.

---

## `today.isCurrentlyAway`

**Type:** boolean

Indicates whether the current location differs from the configured homebase.

Example:

    homebase = EDDF
    currentLocation = MMMX

results in:

    true

When:

    currentLocation = EDDF

the state becomes:

    false

This state can therefore be used directly in HomeKit, VIS or other ioBroker automations.

---

# `today.flights`

Individual flights of the current UTC date are created below:

    today.flights.0
    today.flights.1
    today.flights.2
    ...

The numbering follows the chronological order of the flights.

If the number of flights changes, obsolete flight objects are automatically removed.

---

# Individual flight states

Each flight contains the following states.

## `flightNumber`

Flight number.

Example:

    LH498

## `date`

The OpenAirLog flight date.

This is always the **UTC departure date**.

The value is not changed when a flight crosses midnight.

## `departure`

Departure airport as ICAO code.

Example:

    EDDF

## `arrival`

Arrival airport as ICAO code.

Example:

    MMMX

## `scheduledOffBlock`

Scheduled departure/off-block time.

If the scheduled value is not available, the actual `off_block` value is used.

## `scheduledOnBlock`

Scheduled arrival/on-block time.

If the scheduled value is not available, the actual `on_block` value is used.

## `aircraftType`

Aircraft type when available.

Example:

    B748

## `aircraftRegistration`

Aircraft registration when available.

Example:

    D-ABYJ

## `crewPosition`

Crew position as provided by OpenAirLog.

Example:

    FO/SF

## `blockMinutes`

Block time in minutes.

Example:

    660

## `direction`

Direction relative to the configured homebase.

Possible values:

- `outbound`
- `inbound`
- `homebase`
- `enroute`

Example with EDDF as homebase:

    EDDF → HAM

results in:

    outbound

while:

    HAM → EDDF

results in:

    inbound

---

# `next`

The `next` object contains the next upcoming flight.

Important:

`next` means the **next flight chronologically**, not simply the first flight of the next calendar day.

The algorithm works as follows:

1. Search for remaining flights on the current UTC date.
2. If one exists, use the earliest remaining flight.
3. Only if there are no remaining flights today, search future dates.

For example:

    Today:

    10:00 EDDF → HAM
    12:00 HAM → EDDF
    20:00 EDDF → BEG

    Tomorrow:

    08:00 EDDF → MUC

At 18:00, `next` is:

    EDDF → BEG

not tomorrow's MUC flight.

---

# `next.flightNumber`

Flight number of the next flight.

---

# `next.date`

UTC departure date of the next flight.

---

# `next.departure`

Departure airport.

---

# `next.arrival`

Arrival airport.

---

# `next.scheduledOffBlock`

Scheduled off-block time.

Falls back to `off_block` when no scheduled value is available.

---

# `next.scheduledOnBlock`

Scheduled on-block time.

Falls back to `on_block` when no scheduled value is available.

---

# `next.aircraftType`

Aircraft type, if available.

Example:

    B748

---

# `next.aircraftRegistration`

Aircraft registration, if available.

Example:

    D-ABYJ

---

# `next.crewPosition`

Crew position, if available.

---

# `next.blockMinutes`

Scheduled/recorded block time in minutes.

---

# `next.direction`

Direction of the next flight relative to the configured homebase.

Example:

    outbound

for:

    EDDF → MMMX

with EDDF configured as homebase.

---

# Time and date handling

The adapter deliberately uses UTC for the OpenAirLog flight date.

The OpenAirLog API provides:

    date

as the departure date.

This is especially important for flights crossing midnight.

Example:

    date:       2026-08-29
    off_block:  23:30
    on_block:   01:30

The flight remains a flight of:

    2026-08-29

The arrival is interpreted as occurring on:

    2026-08-30

for the purpose of determining the current location.

---

# GPS automation

The adapter is designed to work particularly well with a GPS trigger from a mobile phone.

A typical automation can use:

    today.isCurrentlyAway
    today.homebaseAction

For example:

### Departure from homebase

GPS detects arrival at EDDF.

The adapter determines:

    homebaseAction = outbound

The automation can therefore identify that this homebase visit is the beginning of another trip.

### Return to homebase

GPS detects arrival at EDDF.

If there are no further homebase departures that day and the final sector ends at EDDF:

    homebaseAction = inbound

This allows an automation to distinguish between:

    intermediate homebase stop

and:

    final return home

This is particularly useful for short-haul rotations such as:

    EDDF → HAM
    HAM → EDDF
    EDDF → BEG
    BEG → EDDF

The intermediate EDDF visit is not treated as the final return.

---

# Historical flight data

The adapter loads several days of flight history.

This is required to determine:

    today.currentLocation
    today.isCurrentlyAway

even when the current day contains no flights.

For example:

    Yesterday:
    EDDF → MMMX

    Today:
    no flights

The adapter can still determine:

    currentLocation = MMMX
    isCurrentlyAway = true

Historical data is also important when a flight crosses midnight.

---

# API data

The adapter uses the OpenAirLog REST API.

Only read access to flight data is required.

The adapter does not modify flight data in OpenAirLog.

---

# Testing

The repository contains automated tests for the flight logic.

Run:

    npm test

The GitHub Actions workflow tests the adapter against multiple supported Node.js versions.

---

# Development

Install dependencies:

    npm install

Run tests:

    npm test

The adapter is currently under active development and testing.

Please report bugs and suggestions through GitHub.

---

# License

See the repository for the current license information.