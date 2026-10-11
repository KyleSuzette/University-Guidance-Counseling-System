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

        // Review state is scoped to the student's latest clearance.
        // Keep historical records read-only.
        let latestClearance = null;
        let currentSubmission = null;
        const reviewNotice = document.createElement("div");
        reviewNotice.id = "exitReviewNotice";
        reviewNotice.setAttribute("role", "status");
        reviewNotice.style.cssText = "padding:14px 18px;margin:0 0 18px;border:1px solid #e9dff4;border-radius:12px;background:#f8f4ff;line-height:1.6;";
        questionnairePanel?.parentNode?.insertBefore(reviewNotice, questionnairePanel);
        reviewNotice.hidden = true;

        function setReviewNotice(message) {
            reviewNotice.textContent = message;
            reviewNotice.hidden = !message;
        }

        function setFormReadOnly(readOnly) {
            form?.querySelectorAll("input, textarea, select")
                .forEach(element => { element.disabled = readOnly; });
            if (submitButton) {
                submitButton.disabled = readOnly;
                submitButton.textContent = readOnly
                    ? "Questionnaire Not Available"
                    : "Submit Questionnaire";
            }
        }

        async function loadReviewState() {
            const [clearanceData, submissionData] = await Promise.all([
                apiRequest("/clearances/me"),
                apiRequest("/exit-submissions/me")
            ]);
            const records = clearanceData.items || [];
            latestClearance = [...records].sort((a, b) =>
                Number(b.id) - Number(a.id)
            )[0] || null;
            const submissions = submissionData.items || [];
            currentSubmission = submissions.find(item =>
                item.clearance_id === latestClearance?.id &&
                item.questionnaire_id === activeQuestionnaire?.id
            ) || null;

            if (!latestClearance) {
                setReviewNotice("Request clearance access first on the Clearance page.");
                setFormReadOnly(true);
                return false;
            }
            if (latestClearance.workflow_version === 1 || latestClearance.status === "CLEARED") {
                setReviewNotice("This clearance is already finalized or historical. No new questionnaire submission is needed.");
                setFormReadOnly(true);
                return false;
            }
            if (latestClearance.access_status !== "APPROVED") {
                setReviewNotice("Clearance access is " + (latestClearance.access_status || "PENDING") +
                    ". Wait for approval or review your request on the Clearance page.");
                setFormReadOnly(true);
                return false;
            }
            
            if (currentSubmission && currentSubmission.completed) {
                const status = currentSubmission.review_status;

                if (status === "RETURNED") {
                    const saved = await apiRequest(
                        `/exit-submissions/me/${currentSubmission.id}/answers`
                    );

                    (saved.responses || []).forEach(response => {
                        const input = Array.from(
                            form.querySelectorAll("[data-question-id]")
                        ).find(element =>
                            String(element.dataset.questionId) ===
                            String(response.question_id)
                        );

                        if (input) {
                            input.value = response.answer || "";
                        }
                    });
                }

                if (status === "APPROVED" || status === "PENDING") {
                    setReviewNotice(status === "APPROVED"
                        ? "Your Exit Questionnaire has been APPROVED."
                        : "Your Exit Questionnaire has been submitted and is PENDING review.");
                    setFormReadOnly(true);
                    submitButton.textContent = status === "APPROVED" ? "Approved" : "Awaiting Review";
                    return false;
                }
                if (status === "RETURNED") {
                    setReviewNotice("Your questionnaire was RETURNED for correction. " +
                        (currentSubmission.review_remarks || "Please review your answers and resubmit."));
                    setFormReadOnly(false);
                    submitButton.textContent = "Resubmit Corrected Answers";
                    return true;
                }
            }
            setReviewNotice("Clearance access approved. Complete your Exit Questionnaire below.");
            setFormReadOnly(false);
            return true;
        }




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

                try {
                    await loadReviewState();
                } catch (reviewError) {
                    console.error("Unable to verify questionnaire eligibility:", reviewError);
                    setReviewNotice("Unable to verify your clearance and review status. Please reload the page.");
                    setFormReadOnly(true);
                }


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
                // Hide the loading form when the questionnaire
                // cannot be accessed.
                questionnairePanel.classList.add("hidden");
                setFormReadOnly(true);

                if (error?.status === 403) {
                    try {
                        const result = await apiRequest("/clearances/me");

                        const clearance = [...(result.items || [])]
                            .sort((a, b) => Number(b.id) - Number(a.id))[0];

                        if (
                            clearance?.workflow_version === 1 &&
                            clearance?.status === "CLEARED"
                        ) {
                            setReviewNotice(
                                "Your clearance was completed under the previous process. " +
                                "No additional Exit Questionnaire is required."
                            );
                        } else if (!clearance) {
                            setReviewNotice(
                                "You have no clearance request yet. " +
                                "Visit Clearance to request access first."
                            );
                        } else if (clearance.status === "CLEARED") {
                            setReviewNotice(
                                "Your clearance is already complete. " +
                                "No additional questionnaire is required."
                            );
                        } else {
                            setReviewNotice(
                                "Your clearance access is " +
                                (clearance.access_status || "PENDING") +
                                ". Visit Clearance to review your request."
                            );
                        }
                    } catch (lookupError) {
                        console.error(
                            "Cannot check clearance status:",
                            lookupError
                        );

                        setReviewNotice(
                            "The questionnaire is unavailable. " +
                            "Please check your clearance status or try again."
                        );
                    }

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


                    if (!activeQuestionnaire || submitButton.disabled) {
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

                        setReviewNotice("Your questionnaire was submitted and is PENDING review.");


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
