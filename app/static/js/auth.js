document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("loginForm");
    const loginButton = document.getElementById("loginButton");
    const messageBox = document.getElementById("loginMessage");
    const togglePassword = document.getElementById("togglePassword");
    const passwordInput = document.getElementById("password");
    if (new URLSearchParams(location.search).get('password_changed') === '1') {
        showMessage('Password changed successfully. Please sign in with your new password.', 'success');
    }


    if (getAccessToken()) {
        window.location.href = "/dashboard";
        return;
    }


    togglePassword?.addEventListener("click", () => {
        const isPassword = passwordInput.type === "password";
        passwordInput.type = isPassword ? "text" : "password";
        togglePassword.textContent = isPassword ? "Hide" : "Show";
        togglePassword.setAttribute("aria-pressed", String(isPassword));
    });


    loginForm?.addEventListener("submit", async (event) => {

        event.preventDefault();

        hideMessage();

        const email = document.getElementById("email").value.trim();
        const password = passwordInput.value;


        loginButton.disabled = true;
        loginButton.textContent = "Signing In...";


        try {

            const data = await apiRequest("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });


            saveSession(data);


            showMessage("Login successful. Redirecting...", "success");


            setTimeout(() => {
                window.location.href = "/dashboard";
            }, 500);


        } catch (error) {

            const message = error?.data?.message ||
                "Unable to sign in. Please check your credentials.";
            showMessage(message, "error");

        } finally {

            loginButton.disabled = false;
            loginButton.textContent = "Sign In";

        }
    });


    document.getElementById("anonymousReferralButton")?.addEventListener(
        "click",
        () => {
            window.location.href = "/referrals";
        }
    );


    function showMessage(text, type) {
        messageBox.textContent = text;
        messageBox.className = `message ${type}`;
        messageBox.setAttribute("role", "alert");
    }


    function hideMessage() {
        messageBox.textContent = "";
        messageBox.className = "message hidden";
        messageBox.removeAttribute("role");
    }
});
