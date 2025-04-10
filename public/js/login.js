const BASE_URL = "http://localhost:3000";
document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    if (!loginForm) return;

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const error = document.getElementById("login-error");

        try {
            const response = await fetch("http://localhost:3000/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            if (result.success) {
                localStorage.setItem('userId', result.userId); // Save user ID
                window.location.href = result.redirect;
            } else {
                error.textContent = result.message;
                error.style.display = "block";
            }
        } catch (err) {
            error.textContent = "Login failed. Try again.";
            error.style.display = "block";
        }
    });
});
