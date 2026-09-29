document.addEventListener(
    "DOMContentLoaded",
    async () => {

        if (!requireLogin()) {
            return;
        }


        // =====================================================
        // ELEMENTS
        // =====================================================

        const messageBox =
            document.getElementById("adminMessage");

        const accountFormSection =
            document.getElementById("accountFormSection");

        const accountForm =
            document.getElementById("accountForm");

        const accountRole =
            document.getElementById("accountRole");

        const personnelProfileFields =
            document.getElementById("personnelProfileFields");

        const specializationField =
            document.getElementById("specializationField");

        const employeeNumber =
            document.getElementById("employeeNumber");

        const firstName =
            document.getElementById("firstName");

        const lastName =
            document.getElementById("lastName");

        const specialization =
            document.getElementById("specialization");

        const accountTableBody =
            document.getElementById("accountTableBody");

        const roomFormSection =
            document.getElementById("roomFormSection");

        const roomForm =
            document.getElementById("roomForm");

        const roomTableBody =
            document.getElementById("roomTableBody");


        // =====================================================
        // VERIFY ADMIN
        // =====================================================

        try {

            const data =
                await apiRequest("/auth/me");


            if (data.user?.role !== "admin") {

                window.location.href =
                    "/dashboard";

                return;
            }


            await Promise.all([
                loadAccounts(),
                loadRooms()
            ]);


        } catch (error) {

            console.error(
                "Administration initialization failed:",
                error
            );

            showMessage(
                "Unable to load Administration.",
                "error"
            );
        }



        // =====================================================
        // OPEN ACCOUNT FORM
        // =====================================================

        document
            .getElementById("openAccountForm")
            .addEventListener(
                "click",
                () => {

                    accountFormSection
                        .classList
                        .remove("hidden");

                    hideMessage();
                }
            );



        // =====================================================
        // CANCEL ACCOUNT FORM
        // =====================================================

        document
            .getElementById("cancelAccountForm")
            .addEventListener(
                "click",
                () => {

                    resetAccountForm();
                    hideAccountForm();
                }
            );



        // =====================================================
        // ROLE CHANGE
        // =====================================================

        accountRole.addEventListener(
            "change",
            () => {

                updateProfileFields();
            }
        );


        function updateProfileFields() {

            const role =
                accountRole.value;


            const isPersonnel =
                role === "counselor" ||
                role === "head_counselor" ||
                role === "staff" ||
                role === "admin";


            const isCounselor =
                role === "counselor" ||
                role === "head_counselor";


            // -------------------------------------------------
            // PERSONNEL FIELDS
            // -------------------------------------------------

            personnelProfileFields
                .classList
                .toggle(
                    "hidden",
                    !isPersonnel
                );


            employeeNumber.required =
                isPersonnel;

            firstName.required =
                isPersonnel;

            lastName.required =
                isPersonnel;


            // -------------------------------------------------
            // SPECIALIZATION
            // -------------------------------------------------

            specializationField
                .classList
                .toggle(
                    "hidden",
                    !isCounselor
                );


            // Specialization remains optional.
            specialization.required =
                false;


            if (!isCounselor) {

                specialization.value =
                    "";
            }


            if (!isPersonnel) {

                employeeNumber.value =
                    "";

                firstName.value =
                    "";

                lastName.value =
                    "";
            }
        }



        // =====================================================
        // CREATE ACCOUNT
        // =====================================================

        accountForm.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                hideMessage();


                const role =
                    accountRole.value;


                const payload = {

                    email:
                        document
                            .getElementById("accountEmail")
                            .value
                            .trim(),

                    password:
                        document
                            .getElementById("accountPassword")
                            .value,

                    role:
                        role
                };


                // -------------------------------------------------
                // PERSONNEL PROFILE
                // -------------------------------------------------

                const isPersonnel =
                    role === "counselor" ||
                    role === "head_counselor" ||
                    role === "staff" ||
                    role === "admin";


                if (isPersonnel) {

                    payload.employee_number =
                        employeeNumber
                            .value
                            .trim();

                    payload.first_name =
                        firstName
                            .value
                            .trim();

                    payload.last_name =
                        lastName
                            .value
                            .trim();
                }


                // -------------------------------------------------
                // COUNSELOR SPECIALIZATION
                // -------------------------------------------------

                const isCounselor =
                    role === "counselor" ||
                    role === "head_counselor";


                if (isCounselor) {

                    const specializationValue =
                        specialization
                            .value
                            .trim();


                    if (specializationValue) {

                        payload.specialization =
                            specializationValue;
                    }
                }


                const button =
                    document.getElementById(
                        "createAccountButton"
                    );


                button.disabled =
                    true;

                button.textContent =
                    "Creating...";


                try {

                    await apiRequest(
                        "/admin/accounts",
                        {
                            method: "POST",

                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );


                    showMessage(
                        "Account created successfully.",
                        "success"
                    );


                    resetAccountForm();

                    hideAccountForm();

                    await loadAccounts();


                } catch (error) {

                    console.error(
                        "Account creation failed:",
                        error
                    );


                    showMessage(
                        getErrorMessage(
                            error,
                            "Unable to create account."
                        ),
                        "error"
                    );


                } finally {

                    button.disabled =
                        false;

                    button.textContent =
                        "Create Account";
                }
            }
        );



        // =====================================================
        // LOAD ACCOUNTS
        // =====================================================

        async function loadAccounts() {

            accountTableBody.innerHTML =
                `
                    <tr>
                        <td
                            colspan="5"
                            class="empty-table"
                        >
                            Loading accounts...
                        </td>
                    </tr>
                `;


            try {

                const data =
                    await apiRequest(
                        "/admin/accounts"
                    );


                renderAccounts(
                    data.items || []
                );


            } catch (error) {

                console.error(
                    "Unable to load accounts:",
                    error
                );


                accountTableBody.innerHTML =
                    `
                        <tr>
                            <td
                                colspan="5"
                                class="empty-table"
                            >
                                Unable to load accounts.
                            </td>
                        </tr>
                    `;
            }
        }



        // =====================================================
        // RENDER ACCOUNTS
        // =====================================================

        function renderAccounts(accounts) {

            accountTableBody.innerHTML =
                "";


            if (!accounts.length) {

                accountTableBody.innerHTML =
                    `
                        <tr>
                            <td
                                colspan="5"
                                class="empty-table"
                            >
                                No accounts found.
                            </td>
                        </tr>
                    `;

                return;
            }


            accounts.forEach(
                account => {

                    const profile =
                        account.profile;


                    let name =
                        "—";


                    if (profile) {

                        name =
                            profile.full_name ||
                            `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
                            "—";
                    }


                    const row =
                        document.createElement(
                            "tr"
                        );


                    row.innerHTML =
                        `
                            <td>
                                ${escapeHtml(name)}
                            </td>

                            <td>
                                ${escapeHtml(
                                    account.email
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    formatRole(
                                        account.role
                                    )
                                )}
                            </td>

                            <td>

                                <span
                                    class="status-badge ${
                                        account.is_active
                                            ? "status-active"
                                            : "status-inactive"
                                    }"
                                >
                                    ${
                                        account.is_active
                                            ? "Active"
                                            : "Inactive"
                                    }
                                </span>

                            </td>

                            <td>

                                <button
                                    type="button"
                                    class="table-action-button account-status-button"
                                    data-id="${account.id}"
                                    data-active="${account.is_active}"
                                >
                                    ${
                                        account.is_active
                                            ? "Deactivate"
                                            : "Activate"
                                    }
                                </button>

                            </td>
                        `;


                    accountTableBody
                        .appendChild(row);
                }
            );


            bindAccountButtons();
        }



        // =====================================================
        // ACTIVATE / DEACTIVATE ACCOUNT
        // =====================================================

        function bindAccountButtons() {

            document
                .querySelectorAll(
                    ".account-status-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            async () => {

                                const id =
                                    button.dataset.id;


                                const currentlyActive =
                                    button.dataset.active ===
                                    "true";


                                const action =
                                    currentlyActive
                                        ? "deactivate"
                                        : "activate";


                                if (
                                    !window.confirm(
                                        `Are you sure you want to ${action} this account?`
                                    )
                                ) {

                                    return;
                                }


                                try {

                                    await apiRequest(
                                        `/admin/accounts/${id}/active`,
                                        {
                                            method:
                                                "PATCH",

                                            body:
                                                JSON.stringify({
                                                    is_active:
                                                        !currentlyActive
                                                })
                                        }
                                    );


                                    showMessage(
                                        `Account ${
                                            currentlyActive
                                                ? "deactivated"
                                                : "activated"
                                        } successfully.`,
                                        "success"
                                    );


                                    await loadAccounts();


                                } catch (error) {

                                    showMessage(
                                        getErrorMessage(
                                            error,
                                            "Unable to update account."
                                        ),
                                        "error"
                                    );
                                }
                            }
                        );
                    }
                );
        }



        // =====================================================
        // OPEN ROOM FORM
        // =====================================================

        document
            .getElementById("openRoomForm")
            .addEventListener(
                "click",
                () => {

                    roomFormSection
                        .classList
                        .remove("hidden");

                    hideMessage();
                }
            );



        // =====================================================
        // CANCEL ROOM FORM
        // =====================================================

        document
            .getElementById("cancelRoomForm")
            .addEventListener(
                "click",
                () => {

                    roomForm.reset();

                    hideRoomForm();
                }
            );



        // =====================================================
        // CREATE ROOM
        // =====================================================

        roomForm.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                hideMessage();


                const name =
                    document
                        .getElementById("roomName")
                        .value
                        .trim();


                const location =
                    document
                        .getElementById("roomLocation")
                        .value
                        .trim();


                const payload = {
                    name: name
                };


                if (location) {

                    payload.location =
                        location;
                }


                const button =
                    document.getElementById(
                        "createRoomButton"
                    );


                button.disabled =
                    true;

                button.textContent =
                    "Adding...";


                try {

                    await apiRequest(
                        "/rooms",
                        {
                            method:
                                "POST",

                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );


                    showMessage(
                        "Guidance room added successfully.",
                        "success"
                    );


                    roomForm.reset();

                    hideRoomForm();

                    await loadRooms();


                } catch (error) {

                    console.error(
                        "Room creation failed:",
                        error
                    );


                    showMessage(
                        getErrorMessage(
                            error,
                            "Unable to add guidance room."
                        ),
                        "error"
                    );


                } finally {

                    button.disabled =
                        false;

                    button.textContent =
                        "Add Room";
                }
            }
        );



        // =====================================================
        // LOAD ROOMS
        // =====================================================

        async function loadRooms() {

            roomTableBody.innerHTML =
                `
                    <tr>
                        <td
                            colspan="3"
                            class="empty-table"
                        >
                            Loading rooms...
                        </td>
                    </tr>
                `;


            try {

                const data =
                    await apiRequest(
                        "/rooms"
                    );


                const rooms =
                    data.items || [];


                roomTableBody.innerHTML =
                    "";


                if (!rooms.length) {

                    roomTableBody.innerHTML =
                        `
                            <tr>
                                <td
                                    colspan="3"
                                    class="empty-table"
                                >
                                    No guidance rooms found.
                                </td>
                            </tr>
                        `;

                    return;
                }


                rooms.forEach(
                    room => {

                        const row =
                            document.createElement(
                                "tr"
                            );


                        row.innerHTML =
                            `
                                <td>
                                    ${escapeHtml(
                                        room.name
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        room.location ||
                                        "—"
                                    )}
                                </td>

                                <td>
                                    <span
                                        class="status-badge status-active"
                                    >
                                        Active
                                    </span>
                                </td>
                            `;


                        roomTableBody
                            .appendChild(row);
                    }
                );


            } catch (error) {

                console.error(
                    "Unable to load rooms:",
                    error
                );


                roomTableBody.innerHTML =
                    `
                        <tr>
                            <td
                                colspan="3"
                                class="empty-table"
                            >
                                Unable to load rooms.
                            </td>
                        </tr>
                    `;
            }
        }



        // =====================================================
        // LOGOUT
        // =====================================================

        document
            .getElementById("logoutButton")
            .addEventListener(
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
                            "Logout failed:",
                            error
                        );


                    } finally {

                        clearSession();

                        window.location.href =
                            "/";
                    }
                }
            );



        // =====================================================
        // HELPERS
        // =====================================================

        function resetAccountForm() {

            accountForm.reset();


            personnelProfileFields
                .classList
                .add("hidden");


            specializationField
                .classList
                .add("hidden");


            employeeNumber.required =
                false;

            firstName.required =
                false;

            lastName.required =
                false;

            specialization.required =
                false;
        }


        function hideAccountForm() {

            accountFormSection
                .classList
                .add("hidden");
        }


        function hideRoomForm() {

            roomFormSection
                .classList
                .add("hidden");
        }


        function formatRole(role) {

            if (!role) {
                return "—";
            }


            return String(role)
                .replaceAll(
                    "_",
                    " "
                )
                .replace(
                    /\b\w/g,
                    letter =>
                        letter.toUpperCase()
                );
        }


        function escapeHtml(value) {

            if (value == null) {
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


        function getErrorMessage(
            error,
            fallback
        ) {

            return (
                error?.data?.message ||
                error?.data?.error ||
                error?.message ||
                fallback
            );
        }


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
