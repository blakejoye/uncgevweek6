document.addEventListener("DOMContentLoaded", () => {
    fetchDashboardCounts();
    fetchMaintenanceStatus();
});

async function fetchDashboardCounts() {
    try {
        const [
            activeChargers,
            upcomingReservations,
            reportedIssues,
            openTickets,
            registeredUsers
        ] = await Promise.all([
            fetchCount("/chargers/active-count", "active_chargers"),
            fetchCount("/reservations/count", "reservation_count"),
            fetchCount("/maintenance/unresolved-count", "issue_count"),
            fetchCount("/maintenance/open-tickets-count", "ticket_count"),
            fetchCount("/users/count", "user_count"),
        ]);

        updateCard("activeChargersCount", activeChargers);
        updateCard("upcomingReservationsCount", upcomingReservations);
        updateCard("reportedIssuesCount", reportedIssues);
        updateCard("openTicketsCount", openTickets);
        updateCard("registeredUsersCount", registeredUsers);
    } catch (err) {
        console.error("Dashboard Error:", err);
    }
}

async function fetchCount(url, field) {
    const res = await fetch(url);
    const data = await res.json();
    return data[field] || 0;
}

function updateCard(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

async function fetchMaintenanceStatus() {
    try {
        const res = await fetch("/maintenance/status-counts");
        const data = await res.json();

        const chartData = {
            labels: ['Pending', 'In Progress', 'Resolved'],
            datasets: [{
                data: [data.pending || 0, data.in_progress || 0, data.resolved || 0],
                backgroundColor: ['#ffc107', '#17a2b8', '#28a745']
            }]
        };

        const ctx = document.getElementById('maintenanceStatusChart').getContext('2d');
        new Chart(ctx, {
            type: 'pie',
            data: chartData,
            options: {
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function (tooltipItem) {
                                return `${tooltipItem.label}: ${tooltipItem.raw} reports`;
                            }
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error("Maintenance Chart Error:", err);
    }
}
