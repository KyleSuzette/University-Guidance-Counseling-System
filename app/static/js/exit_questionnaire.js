document.addEventListener(
    "DOMContentLoaded",
    async () => {


        // =================================================
        // AUTHENTICATION
        // =================================================

        if (!requireLogin()) {
            return;
        }



        // =================================================
        // CURRENT USER / ROLE
        // =================================================

        const currentUser =
            JSON.parse(
                localStorage.getItem("user") || "{}"
            );


        const currentRole =
            String(
                currentUser.role || ""
            ).toLowerCase();


        setupRoleNavigation(
            currentRole
        );



        // =================================================
        // DOM ELEMENTS
        // =================================================

        const form =
            document.getElementById(
                "exitQuestionnaireForm"
            );


        const questionsContainer =
            document.getElementById(
                "questionsContainer"
            );


        const titleElement =
            document.getElementById(
                "questionnaireTitle"
            );


        const descriptionElement =
            document.getElementById(
                "questionnaireDescription"
            );


        const questionnairePanel =
            document.getElementById(
                "questionnairePanel"
            );


        const noQuestionnairePanel =
            document.getElementById(
                "noQuestionnairePanel"
            );


        const messageBox =
            document.getElementById(
                "exitMessage"
            );


        const submitButton =
            document.getElementById(
                "submitExitButton"
            );



        // =================================================
        // STATE
        // =================================================

        let activeQuestionnaire = null;



        // =================================================
        // LOAD ACTIVE QUESTIONNAIRE
        // =================================================

        async function loadQuestionnaire() {

            try {

                const data =
                    await apiRequest(
                        "/exit-questionnaires/active"
                    );


                activeQuestionnaire =
                    data.questionnaire ||
                    data;


                if (
                    !activeQuestionnaire ||
                    !activeQuestionnaire.id
                ) {

                    showNoQuestionnaire();

                    return;

                }


                renderQuestionnaire(
                    activeQuestionnaire
                );


            } catch (error) {

                console.error(
                    "Unable to load exit questionnaire:",
                    error
                );


                if (
                    error?.status === 404 ||
                    error?.data?.error === "not_found"
                ) {

                    showNoQuestionnaire();

                    return;

                }


                showMessage(
                    error?.data?.message ||
                    "Unable to load the exit questionnaire.",
                    "error"
                );

            }

        }



        // =================================================
        // RENDER QUESTIONNAIRE
        // =================================================

        function renderQuestionnaire(
            questionnaire
        ) {

            questionnairePanel.classList.remove(
                "hidden"
            );


            noQuestionnairePanel.classList.add(
                "hidden"
            );


            titleElement.textContent =
                questionnaire.title ||
                "Student Exit Questionnaire";


            descriptionElement.textContent =
                questionnaire.description ||
                "Please answer all required questions.";


            const questions =
                questionnaire.questions ||
                [];


            if (!questions.length) {

                questionsContainer.innerHTML = `

                    <div class="empty-state">

                        <h3>
                            No Questions Available
                        </h3>

                        <p>
                            This questionnaire does not contain
                            any questions yet.
                        </p>

                    </div>

                `;


                submitButton.disabled =
                    true;


                return;

            }


            questionsContainer.innerHTML =
                questions
                    .map(
                        (
                            question,
                            index
                        ) => {

                            return renderQuestion(
                                question,
                                index
                            );

                        }
                    )
                    .join("");

        }



        // =================================================
        // RENDER QUESTION
        // =================================================

        function renderQuestion(
            question,
            index
        ) {

            const questionId =
                question.id ||
                index;


            const label =
                escapeHtml(
                    question.prompt ||
                    `Question ${index + 1}`
                );


            const required =
                question.is_required !== false;


            const type =
                question.field_type ||
                "text";



            // =============================================
            // TEXTAREA
            // =============================================

            if (type === "textarea") {

                return `

                    <div class="question-item">

                        <label
                            for="question_${questionId}"
                        >

                            ${index + 1}.
                            ${label}

                            ${
                                required
                                    ? '<span class="required">*</span>'
                                    : ""
                            }

                        </label>


                        <textarea
                            id="question_${questionId}"
                            data-question-id="${questionId}"
                            rows="5"
                            ${required ? "required" : ""}
                        ></textarea>

                    </div>

                `;

            }



            // =============================================
            // SELECT / MULTIPLE CHOICE
            // =============================================

            if (
                type === "select" ||
                type === "multiple_choice"
            ) {

                const options =
                    question.options ||
                    [];


                return `

                    <div class="question-item">

                        <label>

                            ${index + 1}.
                            ${label}

                            ${
                                required
                                    ? '<span class="required">*</span>'
                                    : ""
                            }

                        </label>


                        <select
                            data-question-id="${questionId}"
                            ${required ? "required" : ""}
                        >

                            <option value="">
                                Select an answer
                            </option>

                            ${
                                options
                                    .map(
                                        option => `

                                            <option
                                                value="${escapeHtml(option)}"
                                            >
                                                ${escapeHtml(option)}
                                            </option>

                                        `
                                    )
                                    .join("")
                            }

                        </select>

                    </div>

                `;

            }



            // =============================================
            // RATING
            // =============================================

            if (type === "rating") {

                return `

                    <div class="question-item">

                        <label
                            for="question_${questionId}"
                        >

                            ${index + 1}.
                            ${label}

                            ${
                                required
                                    ? '<span class="required">*</span>'
                                    : ""
                            }

                        </label>


                        <select
                            id="question_${questionId}"
                            data-question-id="${questionId}"
                            ${required ? "required" : ""}
                        >

                            <option value="">
                                Select rating
                            </option>

                            <option value="1">
                                1
                            </option>

                            <option value="2">
                                2
                            </option>

                            <option value="3">
                                3
                            </option>

                            <option value="4">
                                4
                            </option>

                            <option value="5">
                                5
                            </option>

                        </select>

                    </div>

                `;

            }



            // =============================================
            // DEFAULT TEXT INPUT
            // =============================================

            return `

                <div class="question-item">

                    <label
                        for="question_${questionId}"
                    >

                        ${index + 1}.
                        ${label}

                        ${
                            required
                                ? '<span class="required">*</span>'
                                : ""
                        }

                    </label>


                    <input
                        type="text"
                        id="question_${questionId}"
                        data-question-id="${questionId}"
                        ${required ? "required" : ""}
                    >

                </div>

            `;

        }



        // =================================================
        // SUBMIT QUESTIONNAIRE
        // =================================================

        if (form) {

            form.addEventListener(
                "submit",
                async event => {

                    event.preventDefault();


                    if (!activeQuestionnaire) {
                        return;
                    }


                    const inputs =
                        questionsContainer
                            .querySelectorAll(
                                "[data-question-id]"
                            );


                    const answers =
                        [];


                    inputs.forEach(
                        input => {

                            answers.push({

                                question_id:
                                    input.dataset.questionId,

                                answer:
                                    input.value

                            });

                        }
                    );


                    submitButton.disabled =
                        true;


                    submitButton.textContent =
                        "Submitting...";


                    try {

                        await apiRequest(
                            `/exit-questionnaires/${activeQuestionnaire.id}/submit`,
                            {
                                method:
                                    "POST",

                                body:
                                    JSON.stringify({
                                        responses:
                                            answers
                                    })
                            }
                        );


                        showMessage(
                            "Exit questionnaire submitted successfully.",
                            "success"
                        );


                        // Disable questionnaire fields
                        form
                            .querySelectorAll(
                                "input, textarea, select"
                            )
                            .forEach(
                                element => {

                                    element.disabled =
                                        true;

                                }
                            );


                        // Keep button disabled after success
                        submitButton.disabled =
                            true;


                        submitButton.textContent =
                            "Questionnaire Submitted";


                    } catch (error) {

                        console.error(
                            "Submission failed:",
                            error
                        );


                        showMessage(
                            error?.data?.message ||
                            "Unable to submit the exit questionnaire.",
                            "error"
                        );


                        submitButton.disabled =
                            false;


                        submitButton.textContent =
                            "Submit Questionnaire";

                    }

                }
            );

        }



        // =================================================
        // NO QUESTIONNAIRE
        // =================================================

        function showNoQuestionnaire() {

            questionnairePanel.classList.add(
                "hidden"
            );


            noQuestionnairePanel.classList.remove(
                "hidden"
            );

        }



        // =================================================
        // MESSAGE
        // =================================================

        function showMessage(
            message,
            type
        ) {

            if (!messageBox) {
                return;
            }


            messageBox.textContent =
                message;


            messageBox.className =
                `message ${type}`;

        }



        // =================================================
        // HTML ESCAPING
        // =================================================

        function escapeHtml(
            value
        ) {

            if (
                value === null ||
                value === undefined
            ) {

                return "";

            }


            return String(value).replace(
                /[&<>"']/g,
                character => ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                }[character])
            );

        }



        // =================================================
        // SIDEBAR NAVIGATION
        // =================================================

        const dashboardNav =
            document.getElementById(
                "dashboardNav"
            );


        const appointmentsNav =
            document.getElementById(
                "appointmentsNav"
            );


        const casesNav =
            document.getElementById(
                "casesNav"
            );


        const referralsNav =
            document.getElementById(
                "referralsNav"
            );


        const clearanceNav =
            document.getElementById(
                "clearanceNav"
            );


        const adminNav =
            document.getElementById(
                "adminNav"
            );


        const profileButton =
            document.getElementById(
                "profileButton"
            );


        const logoutButton =
            document.getElementById(
                "logoutButton"
            );



        // Dashboard

        if (dashboardNav) {

            dashboardNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/dashboard";

                }
            );

        }



        // Appointments

        if (appointmentsNav) {

            appointmentsNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/appointments";

                }
            );

        }



        // Cases

        if (casesNav) {

            casesNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/cases";

                }
            );

        }



        // Referrals

        if (referralsNav) {

            referralsNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/referrals";

                }
            );

        }



        /*
         * Exit Questionnaire is the current page,
         * so exitNav does not need a click handler.
         */



        // Clearance

        if (clearanceNav) {

            clearanceNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/clearance";

                }
            );

        }



        // Administration

        if (adminNav) {

            adminNav.addEventListener(
                "click",
                () => {

                    if (
                        currentRole ===
                        "admin"
                    ) {

                        window.location.href =
                            "/admin-management";

                    }

                }
            );

        }



        // My Profile

        if (profileButton) {

            profileButton.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/dashboard";

                }
            );

        }



        // =================================================
        // LOGOUT
        // =================================================

        if (logoutButton) {

            logoutButton.addEventListener(
                "click",
                async () => {

                    try {

                        await apiRequest(
                            "/auth/logout",
                            {
                                method:
                                    "POST"
                            }
                        );


                    } catch (error) {

                        console.error(
                            "Logout error:",
                            error
                        );


                    } finally {

                        clearSession();


                        window.location.href =
                            "/";

                    }

                }
            );

        }



        // =================================================
        // INITIAL LOAD
        // =================================================

        await loadQuestionnaire();


    }
);
