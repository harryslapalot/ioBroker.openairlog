# ioBroker.openairlog

ioBroker adapter for reading flight data from OpenAirLog.

## Features

- Detects whether there is a flight today.
- Determines outbound/inbound using configurable flight-number parity.
- Checks whether the first flight of the day starts in Frankfurt (EDDF).
- Checks whether the last flight of the day ends in Frankfurt (EDDF).
- Exposes today's individual flights as channels.
- Provides the next scheduled flight.
- Queries a date window around today for rotation context.
- Uses the read-only OpenAirLog `flights:read` API scope.

## Configuration

Enter an OpenAirLog API key with the `flights:read` permission.

The default polling interval is 15 minutes and can be configured between 5 and 1440 minutes.

By default:

- even flight number = outbound
- odd flight number = inbound

## Main states

openairlog.0.today.hasFlight
openairlog.0.today.flightCount

openairlog.0.today.startsInFrankfurt
openairlog.0.today.endsInFrankfurt

openairlog.0.today.isOutbound
openairlog.0.today.isInbound
openairlog.0.today.direction

openairlog.0.today.firstFlightNumber
openairlog.0.today.firstDeparture
openairlog.0.today.firstArrival

openairlog.0.today.lastFlightNumber
openairlog.0.today.lastDeparture
openairlog.0.today.lastArrival

openairlog.0.today.currentLocation
openairlog.0.today.isCurrentlyAway

## Example

For a rotation such as:

LH498  EDDF -> MMMX
LH499  MMMX -> EDDF

the adapter reports:

hasFlight         = true
startsInFrankfurt = true
endsInFrankfurt   = true

isOutbound        = true
isInbound         = true
direction         = rotation

The Frankfurt end condition is determined from the actual arrival airport of the last flight of the day.

## Development

npm install
npm test

GitHub Actions runs the test suite automatically on pushes and pull requests.

## API

The adapter uses the OpenAirLog REST API.

The API key is only used for read access and is never written to the repository.

## Disclaimer

This project is independent and is not affiliated with OpenAirLog or Lufthansa.
