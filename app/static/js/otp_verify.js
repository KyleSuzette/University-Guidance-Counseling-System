
document.addEventListener("DOMContentLoaded", () => {

    const form = document.getElementById("otpForm");
    const otpInput = document.getElementById("otpCode");
    const messageBox = document.getElementById("otpMessage");
    const verifyButton = document.getElementById("verifyOtpButton");
    const resendButton = document.getElementById("resendOtpButton");
    const backButton = document.getElementById("backToRegisterButton");
    const emailDisplay = document.getElementById("verificationEmail");

    const email = sessionStorage.getItem("pendingRegistrationEmail");

    // ============================================
    // CHECK PENDING REGISTRATION
    // ============================================

    if (!email) {
        emailDisplay.textContent = "No pending registration found.";

        showMessage(
            "Please complete the registration form first.",
            "error"
        );

        otpInput.disabled = true;
        verifyButton.disabled = true;
        resendButton.disabled = true;

        backButton.addEventListener("click", () => {
            window.location.href = "/register";
        });

        return;
    }

    emailDisplay.textContent = email;

    // ============================================
    // VERIFY OTP
    // ============================================

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        hideMessage();

        const code = otpInput.value.trim();

        if (!/^[0-9]{6}$/.test(code)) {
            showMessage(
                "Please enter a valid 6-digit verification code.",
                "error"
            );
            return;
        }

        verifyButton.disabled = true;
        verifyButton.textContent = "Verifying...";

        try {
            const data = await apiRequest("/auth/verify-otp", {
                method: "POST",
                body: JSON.stringify({
                    email: email,
                    otp_code: code
                })
            });

            sessionStorage.removeItem("pendingRegistrationEmail");

            otpInput.value = "";

            // Do not create an authenticated session after verification.
            // The student must log in using their email and password.

            showMessage(
                "Email verified successfully! Your student account has been created. Redirecting to login...",
                "success"
            );

            verifyButton.disabled = true;
            otpInput.disabled = true;

            window.setTimeout(() => {
                window.location.href = "/";
            }, 1500);

        } catch (error) {

            const message =
                error?.data?.message ||
                error?.data?.error ||
                "Verification failed. Please try again.";

            showMessage(message, "error");

            otpInput.value = "";

            const errorCode = error?.data?.error;

            if (
                errorCode === "otp_locked" ||
                errorCode === "otp_expired" ||
                errorCode === "verification_not_found"
            ) {
                otpInput.disabled = true;
                verifyButton.disabled = true;
            }

        } finally {
            if (!otpInput.disabled) {
                verifyButton.disabled = false;
            }

            verifyButton.textContent = "Verify Email";
        }
    });

    // ============================================
    // REQUEST ANOTHER CODE
    // ============================================
    
    // ============================================
    // RESEND OTP WITH 60-SECOND COOLDOWN
    // ============================================

    let resendCountdown = null;
    let remainingSeconds = 0;
    let resendInProgress = false;

    function startResendCountdown(seconds) {
        clearInterval(resendCountdown);

        remainingSeconds = Math.max(0, Math.ceil(seconds));

        function updateCountdown() {
            if (remainingSeconds > 0) {
                resendButton.disabled = true;
                resendButton.textContent =
                    `Resend Code (${remainingSeconds}s)`;
            } else {
                clearInterval(resendCountdown);
                resendCountdown = null;
                resendButton.disabled = false;
                resendButton.textContent = "Resend Code";
            }
        }

        updateCountdown();

        if (remainingSeconds > 0) {
            resendCountdown = setInterval(() => {
                remainingSeconds--;
                updateCountdown();
            }, 1000);
        }
    }

    // Registration has just sent the first OTP.
    // Start a 60-second countdown before allowing a resend.
    startResendCountdown(60);

    resendButton.addEventListener("click", async () => {
        if (resendInProgress || remainingSeconds > 0) {
            return;
        }

        hideMessage();

        resendInProgress = true;
        resendButton.disabled = true;
        resendButton.textContent = "Sending Code...";

        try {
            const data = await apiRequest("/auth/resend-otp", {
                method: "POST",
                body: JSON.stringify({ email })
            });

            otpInput.value = "";
            otpInput.disabled = false;
            verifyButton.disabled = false;

            showMessage(
                "A new verification code has been sent to your email. The previous code is no longer valid.",
                "success"
            );

            startResendCountdown(
                data.retry_after_seconds || 60
            );

        } catch (error) {
            const message =
                error?.data?.message ||
                "Unable to resend verification code.";

            showMessage(message, "error");

            if (error?.data?.error === "otp_cooldown") {
                startResendCountdown(
                    error?.data?.retry_after_seconds || 60
                );
            } else if (
                error?.data?.error === "verification_not_found" ||
                error?.data?.error === "duplicate_email"
            ) {
                resendButton.disabled = true;
                resendButton.textContent = "Resend Unavailable";
            } else {
                resendButton.disabled = false;
                resendButton.textContent = "Resend Code";
            }

        } finally {
            resendInProgress = false;
        }
    });

    
    // ============================================
    // BACK TO REGISTRATION
    // ============================================

    backButton.addEventListener("click", () => {
        window.location.href = "/register";
    });

    // ============================================
    // MESSAGE HELPERS
    // ============================================

    function showMessage(message, type) {
        messageBox.textContent = message;
        messageBox.className = `message ${type}`;
    }

    function hideMessage() {
        messageBox.textContent = "";
        messageBox.className = "message hidden";
    }

});
