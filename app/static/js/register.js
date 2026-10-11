
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("registerForm");
    const messageBox = document.getElementById("registerMessage");
    const submitButton = document.getElementById("registerSubmitButton");
    const passwordInput = document.getElementById("password");
    const togglePasswordButton = document.getElementById("togglePassword");
    const backToLoginButton = document.getElementById("backToLoginButton");

    // ============================================
    // SHOW / HIDE PASSWORD
    // ============================================

    togglePasswordButton.addEventListener("click", () => {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            togglePasswordButton.textContent = "Hide";
        } else {
            passwordInput.type = "password";
            togglePasswordButton.textContent = "Show";
        }
    });

    // ============================================
    // REGISTER - SEND EMAIL OTP
    // ============================================

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideMessage();

        const payload = {
            first_name: document.getElementById("firstName").value.trim(),
            last_name: document.getElementById("lastName").value.trim(),
            student_number: document.getElementById("studentNumber").value.trim(),
            program: document.getElementById("program").value.trim(),
            year_level: Number(document.getElementById("yearLevel").value),
            contact_number: document.getElementById("contactNumber").value.trim(),
            email: document.getElementById("email").value.trim().toLowerCase(),
            password: passwordInput.value
        };

        submitButton.disabled = true;
        submitButton.textContent = "Sending Verification Code...";

        try {
            const data = await apiRequest("/auth/register", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            // Store only the email, never the password or OTP.
            sessionStorage.setItem(
                "pendingRegistrationEmail",
                data.email || payload.email
            );

            showMessage(
                "Verification code sent! Redirecting to email verification...",
                "success"
            );

            // Clear the password from the form after submission.
            passwordInput.value = "";

            window.setTimeout(() => {
                window.location.href = "/verify-otp";
            }, 700);

        } catch (error) {
            console.error("Registration request failed.");

            const message =
                error?.data?.message ||
                error?.data?.error ||
                "Unable to send verification code. Please try again.";

            showMessage(message, "error");

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Send Verification Code";
        }
    });

    // ============================================
    // BACK TO LOGIN
    // ============================================

    backToLoginButton.addEventListener("click", () => {
        window.location.href = "/";
    });

    // ============================================
    // MESSAGE HELPERS
    // ============================================

    let messageTimeout;

    function showMessage(message, type) {
        clearTimeout(messageTimeout);

        messageBox.textContent = message;
        messageBox.className = `message ${type}`;

        if (type === "error") {
            const scrollContainer = form.closest(".auth-card");

            if (scrollContainer) {
                scrollContainer.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });
            }

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }

        messageTimeout = setTimeout(() => {
            hideMessage();
        }, 5000);
    }

    function hideMessage() {
        clearTimeout(messageTimeout);
        messageBox.textContent = "";
        messageBox.className = "message hidden";
    }
});
