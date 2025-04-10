const BASE_URL = "http://localhost:3000";

document.addEventListener("DOMContentLoaded", () => {
    fetchChargers();
    fetchBookings();

    document.getElementById("bookingDate").addEventListener("change", fetchAvailableTimeSlots);
    document.getElementById("chargerSelect").addEventListener("change", fetchAvailableTimeSlots);
    document.getElementById("startTime").addEventListener("change", updateEndTimeOptions);

    startPollingReservations();
});

// ✅ Fetch chargers and populate dropdown
async function fetchChargers() {
    try {
        const response = await fetch(`${BASE_URL}/chargers`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const chargers = await response.json();

        const chargerSelect = document.getElementById('chargerSelect');
        chargerSelect.innerHTML = '<option value="">Select a Charging Station</option>';

        chargers.forEach(charger => {
            const option = document.createElement("option");
            option.value = charger.chargerid;
            option.textContent = charger.location;
            chargerSelect.appendChild(option);
        });
    } catch (error) {
        console.error('❌ Error fetching chargers:', error);
    }
}

// ✅ Fetch available time slots based on selected charger and date
async function fetchAvailableTimeSlots() {
    const chargerid = document.getElementById("chargerSelect").value;
    const selectedDate = document.getElementById("bookingDate").value;

    if (!chargerid || !selectedDate) return;

    try {
        const response = await fetch(`${BASE_URL}/reservations/all-bookings`);
        if (!response.ok) throw new Error("Failed to fetch reservations");

        const reservations = await response.json();
        generateTimeSlots(reservations, chargerid, selectedDate);
    } catch (error) {
        console.error('❌ Error fetching all bookings for time slot generation:', error);
    }
}


// ✅ Generate available time slots dynamically, removing booked slots

function generateTimeSlots(reservations, chargerid, selectedDate) {
    const startSelect = document.getElementById("startTime");
    const endSelect = document.getElementById("endTime");

    startSelect.innerHTML = '<option value="">Select Start Time</option>';
    endSelect.innerHTML = '<option value="">Select End Time</option>';
    startSelect.disabled = false;
    endSelect.disabled = true;

    if (!chargerid || !selectedDate) return;

    console.log(`📅 Selected Date: ${selectedDate}`);

    // ✅ Get all booked times for the selected charger and adjust to EST
    const bookedTimes = reservations
        .filter(res => res.chargerid == chargerid && res.starttime.includes(selectedDate))
        .map(res => {
            let startEST = convertUTCtoEST(res.starttime);
            let endEST = convertUTCtoEST(res.endtime);

            console.log(`🔴 Booked Slot: ${startEST.toLocaleTimeString()} - ${endEST.toLocaleTimeString()} (Adjusted EST)`);

            return { start: startEST, end: endEST };
        });

    let availableTimes = [];

    for (let hour = 0; hour < 24; hour++) {
        for (let minutes = 0; minutes < 60; minutes += 15) {
            let amPm = hour < 12 ? "AM" : "PM";
            let displayHour = hour % 12 || 12;
            let timeString = `${displayHour}:${minutes.toString().padStart(2, '0')} ${amPm}`;
            let value = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

            let currentTime = new Date(`${selectedDate}T${value}`);


            // ✅ Check if this time is already booked
            const isBooked = bookedTimes.some(reservation =>
                currentTime >= reservation.start && currentTime < reservation.end
            );

            let startOption = document.createElement("option");
            startOption.value = value;
            startOption.textContent = timeString;
            if (isBooked) {
                startOption.style.color = "red";
                startOption.disabled = true;
                console.log(`⛔ Blocked Slot: ${timeString} (Corrected EST)`);
            }
            startSelect.appendChild(startOption);
            availableTimes.push({ value, timeString, disabled: isBooked });
        }
    }

    startSelect.dataset.availableTimes = JSON.stringify(availableTimes);
}

// ✅ Function to Convert UTC time to EST (-4 hours)
function convertUTCtoEST(utcDateTime) {
    let date = new Date(utcDateTime);
    date.setHours(date.getHours() - 4); // ✅ Hardcoded EST adjustment
    return date;
}
// ✅ Populate end time dropdown based on selected start time
function updateEndTimeOptions() {
    const startSelect = document.getElementById("startTime");
    const endSelect = document.getElementById("endTime");

    endSelect.innerHTML = '<option value="">Select End Time</option>';
    endSelect.disabled = true;

    const selectedStartTime = startSelect.value;
    if (!selectedStartTime) return;

    const availableTimes = JSON.parse(startSelect.dataset.availableTimes || "[]");

    let canAddTimes = false;
    availableTimes.forEach(timeSlot => {
        if (timeSlot.value === selectedStartTime) {
            canAddTimes = true;
        }

        if (canAddTimes) {
            let endOption = document.createElement("option");
            endOption.value = timeSlot.value;
            endOption.textContent = timeSlot.timeString;

            // ✅ Check if this slot is disabled in the start time list (meaning it's booked)
            const matchingStartOption = Array.from(startSelect.options).find(opt => opt.value === timeSlot.value);
            if (matchingStartOption && matchingStartOption.disabled) {
                endOption.disabled = true;
                endOption.style.color = "red";
            }

            endSelect.appendChild(endOption);
        }
    });

    endSelect.disabled = false;
}

// ✅ Submit Booking with Start & End Time
async function submitBooking() {
    const chargerid = document.getElementById('chargerSelect').value;
    const date = document.getElementById('bookingDate').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const user_id = localStorage.getItem("userId");


    if (!chargerid || !date || !startTime || !endTime) {
        alert("⚠️ Please select all booking details.");
        return;
    }

    if (endTime <= startTime) {
        alert("⚠️ End time must be later than start time.");
        return;
    }

    const starttime = `${date}T${startTime}`;
    const endtime = `${date}T${endTime}`;

    try {
        const response = await fetch(`${BASE_URL}/reservations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chargerid, starttime, endtime, user_id })
        });

        const result = await response.json();

        if (response.status === 400) {
            alert(result.message);
        } else {
            alert("✅ Booking confirmed!");
            fetchBookings();
            fetchAvailableTimeSlots();
        }
    } catch (error) {
        console.error('Error booking charger:', error);
        alert("⚠️ Booking could not be completed. Please try again.");
    }
}

// ✅ Convert time to 12-hour format (Adjust UTC to EST)
function formatTimeTo12Hour(utcDateTime) {
    const utcDate = new Date(utcDateTime);
    utcDate.setHours(utcDate.getHours() - 4); // ✅ Adjust UTC to EST (-4 hours)

    let hour = utcDate.getHours();
    const minute = utcDate.getMinutes().toString().padStart(2, "0");
    const amPm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;

    return `${hour}:${minute} ${amPm}`;
}

// ✅ Fetch and display bookings
async function fetchBookings() {
    const userId = localStorage.getItem("userId");
    if (!userId) {
        console.warn("⚠️ No userId found in localStorage");
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/reservations?user_id=${userId}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const bookings = await response.json();
        const tableBody = document.querySelector("#bookingTable tbody");
        tableBody.innerHTML = '';

        if (bookings.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No bookings found.</td></tr>`;
            return;
        }

        bookings.forEach(booking => {
            const startTime = formatTimeTo12Hour(booking.starttime);
            const endTime = formatTimeTo12Hour(booking.endtime);

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${formatDateToLocal(booking.starttime)}</td>
                <td>${startTime} - ${endTime}</td>
                <td>${booking.location}</td>
                <td>
                    <button class="edit-btn" onclick="editBooking(${booking.reservationid}, ${booking.chargerid}, '${booking.starttime}', '${booking.endtime}', '${booking.starttime.split('T')[0]}')">Edit</button>
                    <button class="delete-btn" onclick="cancelBooking(${booking.reservationid})">Cancel</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Error fetching bookings:', error);
    }
}



// ✅ Open edit modal and prefill booking details
function editBooking(reservationId, chargerId, currentStartTime, currentEndTime, currentDate) {
    document.getElementById("editModal").style.display = "block";

    const chargerSelect = document.getElementById("editChargerSelect");
    chargerSelect.innerHTML = `<option value="${chargerId}" selected>Current Station</option>`;
    chargerSelect.disabled = true;

    document.getElementById("editBookingDate").value = currentDate;

    // Format to dropdown value ("HH:MM:SS")
    const startValue = currentStartTime.split("T")[1];
    const endValue = currentEndTime.split("T")[1];

    // Call to populate red-blocked times
    populateEditTimeSlots(chargerId, currentDate, reservationId).then(() => {
        const startSelect = document.getElementById("editStartTime");
        const endSelect = document.getElementById("editEndTime");

        startSelect.value = startValue;
        endSelect.value = endValue;

        // Add change listener like the main form
        startSelect.addEventListener("change", updateEditEndTimeOptions);
    });

    document.getElementById("editBookingBtn").onclick = function () {
        submitEditBooking(reservationId, chargerId);
    };
}
function updateEditEndTimeOptions() {
    const startSelect = document.getElementById("editStartTime");
    const endSelect = document.getElementById("editEndTime");

    endSelect.innerHTML = '<option value="">Select End Time</option>';
    endSelect.disabled = true;

    const selectedStartTime = startSelect.value;
    if (!selectedStartTime) return;

    const availableTimes = JSON.parse(startSelect.dataset.availableTimes || "[]");

    let canAddTimes = false;
    availableTimes.forEach(timeSlot => {
        if (timeSlot.value === selectedStartTime) {
            canAddTimes = true;
        }

        if (canAddTimes) {
            const option = document.createElement("option");
            option.value = timeSlot.value;
            option.textContent = timeSlot.timeString;

            if (timeSlot.disabled) {
                option.disabled = true;
                option.style.color = "red";
            }

            endSelect.appendChild(option);
        }
    });

    endSelect.disabled = false;
}



// ✅ Cancel a booking
async function cancelBooking(reservationId) {
    if (!confirm("Are you sure you want to cancel this booking?")) return;

    try {
        const response = await fetch(`${BASE_URL}/reservations/${reservationId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (response.ok) {
            alert("✅ Booking successfully canceled!");
            fetchBookings();  // Refresh bookings after deletion
            fetchAvailableTimeSlots(); // Update available slots
        } else {
            alert(`⚠️ Deletion Failed: ${result.message}`);
        }
    } catch (error) {
        console.error('❌ Error canceling booking:', error);
        alert("⚠️ Could not delete booking. Please try again.");
    }
}


// ✅ Submit edited booking details
// ✅ Submit edited booking details
async function submitEditBooking(reservationId) {
    const chargerid = document.getElementById('editChargerSelect').value;
    const date = document.getElementById('editBookingDate').value;
    const startTime = document.getElementById('editStartTime').value;
    const endTime = document.getElementById('editEndTime').value;

    if (!chargerid || !date || !startTime || !endTime) {
        alert("⚠️ Please select all fields.");
        return;
    }

    if (endTime <= startTime) {
        alert("⚠️ End time must be later than start time.");
        return;
    }

    const starttime = `${date}T${startTime}`;
    const endtime = `${date}T${endTime}`;

    try {
        console.log("🛠️ Sending Update Request:", { chargerid, starttime, endtime });

        const response = await fetch(`${BASE_URL}/reservations/${reservationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chargerid, starttime, endtime })
        });

        const result = await response.json();
        console.log("🛠️ Server Response:", result); // Log the response

        if (response.ok) {
            alert("✅ Booking updated successfully!");
            fetchBookings();
            closeEditModal();
        } else {
            alert(`⚠️ Update Failed: ${result.message || "Unknown Error"}`);
        }
    } catch (error) {
        console.error('❌ Error updating booking:', error);
        alert("⚠️ Could not update booking. Please try again.");
    }
}



function closeEditModal() {
    console.log("🛑 Closing edit modal...");
    document.getElementById("editModal").style.display = "none";

    // Clear the form fields to avoid seeing old data
    document.getElementById("editChargerSelect").value = "";
    document.getElementById("editBookingDate").value = "";
    document.getElementById("editStartTime").value = "";
    document.getElementById("editEndTime").value = "";
}
async function populateEditTimeSlots(chargerid, selectedDate, reservationId) {
    const startSelect = document.getElementById("editStartTime");
    const endSelect = document.getElementById("editEndTime");

    startSelect.innerHTML = '<option value="">Select Start Time</option>';
    endSelect.innerHTML = '<option value="">Select End Time</option>';
    startSelect.disabled = false;
    endSelect.disabled = true;

    try {
        // ✅ New route that returns all reservations
        const response = await fetch(`${BASE_URL}/reservations/all-bookings`);
        const reservations = await response.json();

        if (!Array.isArray(reservations)) {
            console.error("❌ Expected array but got:", reservations);
            return;
        }

        // Filter out this user's current reservation (so we can re-edit it)
        const bookedTimes = reservations
            .filter(res =>
                res.chargerid == chargerid &&
                res.starttime.includes(selectedDate) &&
                res.reservationid != reservationId
            )
            .map(res => {
                const start = new Date(res.starttime);
                const end = new Date(res.endtime);
                start.setHours(start.getHours() - 4); // Adjust to EST
                end.setHours(end.getHours() - 4);
                return { start, end };
            });

        let availableTimes = [];

        for (let hour = 0; hour < 24; hour++) {
            for (let minutes = 0; minutes < 60; minutes += 15) {
                const amPm = hour < 12 ? "AM" : "PM";
                const displayHour = hour % 12 || 12;
                const timeString = `${displayHour}:${minutes.toString().padStart(2, '0')} ${amPm}`;
                const value = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

                const currentTime = new Date(`${selectedDate}T${value}`);
                const isBooked = bookedTimes.some(res =>
                    currentTime >= res.start && currentTime < res.end
                );

                const option = document.createElement("option");
                option.value = value;
                option.textContent = timeString;

                if (isBooked) {
                    option.disabled = true;
                    option.style.color = "red";
                }

                startSelect.appendChild(option);

                availableTimes.push({
                    value,
                    timeString,
                    disabled: isBooked
                });
            }
        }

        startSelect.dataset.availableTimes = JSON.stringify(availableTimes);
    } catch (error) {
        console.error('❌ Error populating edit time slots:', error);
    }
}



function startPollingReservations() {
    setInterval(() => {
        fetchBookings();              // Refresh bookings table
        fetchAvailableTimeSlots();   // Refresh available dropdowns
    }, 30000); // every 30 seconds (you can lower this to 10-15s if needed)
}
function formatDateToLocal(utcDateTime) {
    const utcDate = new Date(utcDateTime);
    const localDate = new Date(utcDate.getTime() - utcDate.getTimezoneOffset() * 60000);
    return localDate.toISOString().split("T")[0]; // Returns YYYY-MM-DD
}
