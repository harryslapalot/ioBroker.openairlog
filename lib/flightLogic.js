function findNextFlight(
    flights,
    currentDate,
    currentSeconds
) {
    const sorted = sortFlights(flights);

    /*
     * First look ONLY at flights on the current UTC date.
     * This is important: tomorrow must never be selected
     * while there are still future flights today.
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
     * No more flights today.
     *
     * Now find the first flight on a later UTC date.
     */
    return sorted.find(flight => {
        return (
            flight?.date &&
            flight.date > currentDate
        );
    }) || null;
}