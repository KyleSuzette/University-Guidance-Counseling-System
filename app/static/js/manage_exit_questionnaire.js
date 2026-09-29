document.addEventListener(
    "DOMContentLoaded",
    async () => {

        if (!requireLogin()) {
            return;
        }


        const form =
            document.getElementById(
                "questionnaireForm"
            );

        const builder =
            document.getElementById(
                "questionBuilder"
            );

        const addQuestionButton =
            document.getElementById(
                "addQuestionButton"
            );

        const createButton =
            document.getElementById(
                "createQuestionnaireButton"
            );

        const activeContainer =
            document.getElementById(
                "activeQuestionnaireContainer"
            );

        const messageBox =
            document.getElementById(
                "questionnaireMessage"
            );


        let questionCounter = 0;


        // =============================================
        // CHECK USER ROLE
        // =============================================

        try {

            const account =
                await apiRequest(
                    "/auth/me"
                );


            const user =
                account.user ||
                account;


            // =============================================
            // SETUP ROLE-BASED SIDEBAR
            // =============================================

            setupRoleNavigation(
                user.role
            );


            // =============================================
            // CHECK PAGE ACCESS
            // =============================================

            const canManageQuestionnaire =
                user.role === "admin" ||
                user.role === "head_counselor";


            const canViewQuestionnaire =
                canManageQuestionnaire ||
                user.role === "staff";


            // Completely unauthorized role

            if (!canViewQuestionnaire) {

                showMessage(
                    "You do not have permission to access this page.",
                    "error"
                );


                form.style.display =
                    "none";


                return;

            }


            // =============================================
            // STAFF
            // Staff may view, but not create questionnaires.
            // =============================================

            if (user.role === "staff") {

                form.style.display =
                    "none";
            }


        } catch (error) {

            console.error(
                error
            );

            return;

        }



        // =============================================
        // ADD QUESTION
        // =============================================

        function addQuestion() {

            questionCounter++;


            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "question-builder-item";


            item.dataset.questionNumber =
                questionCounter;


            item.innerHTML = `

                <div class="question-builder-top">

                    <strong>
                        Question ${questionCounter}
                    </strong>

                    <button
                        type="button"
                        class="remove-question-button"
                    >
                        Remove
                    </button>

                </div>


                <div class="form-group">

                    <label>
                        Question
                    </label>

                    <input
                        type="text"
                        class="question-prompt"
                        placeholder="Enter question..."
                        maxlength="500"
                        required
                    >

                </div>


                <div class="question-options-grid">


                    <div class="form-group">

                        <label>
                            Answer Type
                        </label>

                        <select
                            class="question-type"
                        >

                            <option value="text">
                                Short Text
                            </option>

                            <option value="textarea">
                                Long Text
                            </option>

                        </select>

                    </div>


                    <div class="form-group">

                        <label>
                            Required
                        </label>

                        <select
                            class="question-required"
                        >

                            <option value="true">
                                Yes
                            </option>

                            <option value="false">
                                No
                            </option>

                        </select>

                    </div>

                </div>

            `;


            builder.appendChild(
                item
            );


            const removeButton =
                item.querySelector(
                    ".remove-question-button"
                );


            removeButton.addEventListener(
                "click",
                () => {

                    item.remove();

                    renumberQuestions();

                }
            );

        }



        // =============================================
        // RENUMBER QUESTIONS
        // =============================================

        function renumberQuestions() {

            const items =
                builder.querySelectorAll(
                    ".question-builder-item"
                );


            items.forEach(
                (
                    item,
                    index
                ) => {

                    const title =
                        item.querySelector(
                            ".question-builder-top strong"
                        );


                    title.textContent =
                        `Question ${index + 1}`;

                }
            );

        }



        // =============================================
        // ADD QUESTION BUTTON
        // =============================================

        addQuestionButton.addEventListener(
            "click",
            addQuestion
        );



        // =============================================
        // LOAD ACTIVE QUESTIONNAIRE
        // =============================================

        async function loadActiveQuestionnaire() {

            activeContainer.innerHTML =
                "<p>Loading active questionnaire...</p>";


            try {

                const data =
                    await apiRequest(
                        "/exit-questionnaires/active"
                    );


                const questionnaire =
                    data.questionnaire ||
                    data;


                if (
                    !questionnaire ||
                    !questionnaire.id
                ) {

                    showNoActiveQuestionnaire();

                    return;

                }


                renderActiveQuestionnaire(
                    questionnaire
                );


            } catch (error) {

                if (
                    error?.status === 404 ||
                    error?.data?.error ===
                        "not_found"
                ) {

                    showNoActiveQuestionnaire();

                    return;

                }


                activeContainer.innerHTML = `

                    <div class="empty-state">

                        <h3>
                            Unable to Load Questionnaire
                        </h3>

                        <p>
                            The active questionnaire
                            could not be retrieved.
                        </p>

                    </div>

                `;

            }

        }



        // =============================================
        // NO ACTIVE QUESTIONNAIRE
        // =============================================

        function showNoActiveQuestionnaire() {

            activeContainer.innerHTML = `

                <div class="empty-state">

                    <h3>
                        No Active Questionnaire
                    </h3>

                    <p>
                        Create a questionnaire below
                        to make it available to students.
                    </p>

                </div>

            `;

        }



        // =============================================
        // RENDER ACTIVE QUESTIONNAIRE
        // =============================================

        function renderActiveQuestionnaire(
            questionnaire
        ) {

            const questions =
                questionnaire.questions ||
                [];


            activeContainer.innerHTML = `

                <div class="active-questionnaire-card">

                    <div class="active-questionnaire-heading">

                        <div>

                            <span class="active-badge">
                                ACTIVE
                            </span>

                            <h3>
                                ${escapeHtml(
                                    questionnaire.title
                                )}
                            </h3>

                        </div>


                        <strong>
                            ${questions.length}
                            Question${questions.length === 1 ? "" : "s"}
                        </strong>

                    </div>


                    <div class="active-question-list">

                        ${
                            questions.length
                                ? questions
                                    .map(
                                        (
                                            question,
                                            index
                                        ) => `

                                            <div class="active-question-item">

                                                <span>
                                                    ${index + 1}
                                                </span>

                                                <div>

                                                    <strong>
                                                        ${escapeHtml(
                                                            question.prompt ||
                                                            question.question ||
                                                            question.text
                                                        )}
                                                    </strong>

                                                    <small>
                                                        ${
                                                            escapeHtml(
                                                                question.field_type ||
                                                                question.type ||
                                                                "text"
                                                            )
                                                        }

                                                        ·

                                                        ${
                                                            (
                                                                question.is_required ??
                                                                question.required
                                                            )
                                                                ? "Required"
                                                                : "Optional"
                                                        }
                                                    </small>

                                                </div>

                                            </div>

                                        `
                                    )
                                    .join("")
                                : `
                                    <p>
                                        No questions found.
                                    </p>
                                `
                        }

                    </div>

                </div>

            `;

        }



        // =============================================
        // CREATE QUESTIONNAIRE
        // =============================================

        form.addEventListener(
            "submit",
            async event => {

                event.preventDefault();


                const title =
                    document
                        .getElementById(
                            "questionnaireTitle"
                        )
                        .value
                        .trim();


                const questionItems =
                    builder.querySelectorAll(
                        ".question-builder-item"
                    );


                if (!questionItems.length) {

                    showMessage(
                        "Please add at least one question.",
                        "error"
                    );

                    return;

                }


                const questions = [];


                questionItems.forEach(
                    (
                        item,
                        index
                    ) => {

                        const prompt =
                            item
                                .querySelector(
                                    ".question-prompt"
                                )
                                .value
                                .trim();


                        const fieldType =
                            item
                                .querySelector(
                                    ".question-type"
                                )
                                .value;


                        const required =
                            item
                                .querySelector(
                                    ".question-required"
                                )
                                .value ===
                            "true";


                        questions.push({
                            prompt:
                                prompt,

                            field_type:
                                fieldType,

                            is_required:
                                required,

                            position:
                                index + 1
                        });

                    }
                );


                createButton.disabled =
                    true;


                createButton.textContent =
                    "Creating...";


                try {

                    await apiRequest(
                        "/exit-questionnaires",
                        {
                            method:
                                "POST",

                            body:
                                JSON.stringify({
                                    title:
                                        title,

                                    is_active:
                                        true,

                                    questions:
                                        questions
                                })
                        }
                    );


                    showMessage(
                        "Exit questionnaire created successfully.",
                        "success"
                    );


                    form.reset();


                    builder.innerHTML =
                        "";


                    questionCounter =
                        0;


                    addQuestion();


                    await loadActiveQuestionnaire();


                } catch (error) {

                    console.error(
                        "Questionnaire creation failed:",
                        error
                    );


                    showMessage(
                        error?.data?.message ||
                        "Unable to create the exit questionnaire.",
                        "error"
                    );

                } finally {

                    createButton.disabled =
                        false;


                    createButton.textContent =
                        "Create Questionnaire";

                }

            }
        );



        // =============================================
        // MESSAGE
        // =============================================

        function showMessage(
            message,
            type
        ) {

            messageBox.textContent =
                message;


            messageBox.className =
                `message ${type}`;


            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        }



        // =============================================
        // ESCAPE HTML
        // =============================================

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



        // =============================================
        // DEFAULT QUESTION
        // =============================================

        addQuestion();


        await loadActiveQuestionnaire();

    }
);
