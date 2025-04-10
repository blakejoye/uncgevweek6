document.addEventListener("DOMContentLoaded", () => {
    const signupForm = document.getElementById("signup-form");
    if (!signupForm) return;

    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = document.getElementById("username").value;
        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const confirm = document.getElementById("confirm-password").value;
        const error = document.getElementById("error-message");

        if (password !== confirm) {
            error.textContent = "❌ Passwords do not match.";
            error.style.display = "block";
            return;
        }

        try {
            const response = await fetch("http://localhost:3000/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, username, password })
            });

            const result = await response.json();

            if (result.success) {
                window.location.href = "welcome.html";
            } else {
                error.textContent = result.message || "❌ Signup failed.";
                error.style.display = "block";
            }
        } catch (err) {
            error.textContent = "❌ Network error. Try again later.";
            error.style.display = "block";
        }
    });
});
