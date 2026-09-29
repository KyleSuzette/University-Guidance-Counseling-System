document.addEventListener(
    "DOMContentLoaded",
    () => {

        const form =
            document.getElementById(
                "registerForm"
            );

        const messageBox =
            document.getElementById(
                "registerMessage"
            );

        const submitButton =
            document.getElementById(
                "registerSubmitButton"
            );

        const passwordInput =
            document.getElementById(
                "password"
            );


        // =================================================
        // SHOW / HIDE PASSWORD
        // =================================================

        document
            .getElementById(
                "togglePassword"
            )
            .addEventListener(
                "click",
                () => {

                    if (
                        passwordInput.type ===
                        "password"
                    ) {

                        passwordInput.type =
                            "text";

                        document
                            .getElementById(
                                "togglePassword"
                            )
                            .textContent =
                            "Hide";

                    } else {

                        passwordInput.type =
                            "password";

                        document
                            .getElementById(
                                "togglePassword"
                            )
                            .textContent =
                            "Show";
                    }

                }
            );


        // =================================================
        // REGISTER
        // =================================================

        form.addEventListener(
            "submit",
            async (event) => {

                event.preventDefault();

                hideMessage();


                const payload = {

                    first_name:
                        document
                            .getElementById(
                                "firstName"
                            )
                            .value
                            .trim(),

                    last_name:
                        document
                            .getElementById(
                                "lastName"
                            )
                            .value
                            .trim(),

                    student_number:
                        document
                            .getElementById(
                                "studentNumber"
                            )
                            .value
                            .trim(),

                    program:
                        document
                            .getElementById(
                                "program"
                            )
                            .value
                            .trim(),

                    year_level:
                        Number(
                            document
                                .getElementById(
                                    "yearLevel"
                                )
                                .value
                        ),

                    contact_number:
                        document
                            .getElementById(
                                "contactNumber"
                            )
                            .value
                            .trim(),

                    email:
                        document
                            .getElementById(
                                "email"
                            )
                            .value
                            .trim(),

                    password:
                        passwordInput.value

                };


                submitButton.disabled =
                    true;

                submitButton.textContent =
                    "Creating Account...";


                try {

                    const data =
                        await apiRequest(
                            "/auth/register",
                            {
                                method: "POST",

                                body:
                                    JSON.stringify(
                                        payload
                                    )
                            }
                        );


                    saveSession(data);


                    showMessage(
                        "Account created successfully. Redirecting...",
                        "success"
                    );


                    setTimeout(
                        () => {

                            window.location.href =
                                "/dashboard";

                        },
                        700
                    );


                } catch (error) {

                    console.error(
                        "Registration error:",
                        error
                    );


                    const message =
                        error?.data?.message ||
                        error?.data?.error ||
                        "Unable to create account.";


                    showMessage(
                        message,
                        "error"
                    );


                } finally {

                    submitButton.disabled =
                        false;

                    submitButton.textContent =
                        "Create Student Account";
                }

            }
        );


        // =================================================
        // BACK TO LOGIN
        // =================================================

        document
            .getElementById(
                "backToLoginButton"
            )
            .addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/";

                }
            );


        // =================================================
        // MESSAGE HELPERS
        // =================================================

        function showMessage(
            message,
            type
        ) {

            messageBox.textContent =
                message;

            messageBox.className =
                `message ${type}`;
        }


        function hideMessage() {

            messageBox.textContent =
                "";

            messageBox.className =
                "message hidden";
        }

    }
);