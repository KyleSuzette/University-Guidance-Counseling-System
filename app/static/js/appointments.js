document.addEventListener(
    "DOMContentLoaded",
    async () => {

        if (!requireLogin()) {
            return;
        }


        // =============================================
        // ELEMENTS
        // =============================================

        const appointmentFormSection =
            document.getElementById(
                "appointmentFormSection"
            );

        const appointmentForm =
            document.getElementById(
                "appointmentForm"
            );

        const studentSelectGroup =
            document.getElementById(
                "studentSelectGroup"
            );

        const studentSelect =
            document.getElementById(
                "studentSelect"
            );

        const counselorSelect =
            document.getElementById(
                "counselorSelect"
            );

        const roomSelect =
            document.getElementById(
                "roomSelect"
            );

        const tableBody =
            document.getElementById(
                "appointmentTableBody"
            );

        const messageBox =
            document.getElementById(
                "appointmentMessage"
            );

        const submitButton =
            document.getElementById(
                "submitAppointmentButton"
            );

        const statusFilter =
            document.getElementById(
                "statusFilter"
            );

        const openButton =
            document.getElementById(
                "openAppointmentForm"
            );

        const pageDescription =
            document.getElementById(
                "appointmentPageDescription"
            );

        const formTitle =
            document.getElementById(
                "appointmentFormTitle"
            );

        const formDescription =
            document.getElementById(
                "appointmentFormDescription"
            );

        const listTitle =
            document.getElementById(
                "appointmentListTitle"
            );

        const listDescription =
            document.getElementById(
                "appointmentListDescription"
            );

        const studentTableHeading =
            document.getElementById(
                "studentTableHeading"
            );


        // =============================================
        // STATE
        // =============================================

        let currentRole = null;
        let currentProfile = null;

        let students = [];
        let counselors = [];
        let rooms = [];


        const managementRoles = [
            "counselor",
            "head_counselor",
            "admin",
            "staff"
        ];


        // =============================================
        // INITIALIZE
        // =============================================

        try {

            await loadCurrentUser();

            await Promise.all([
                loadCounselors(),
                loadRooms()
            ]);


            if (
                managementRoles.includes(
                    currentRole
                )
            ) {

                await loadStudents();

            }


            await loadAppointments();

        } catch (error) {

            console.error(
                "Appointment initialization error:",
                error
            );

        }


        // =============================================
        // CURRENT USER
        // =============================================

        async function loadCurrentUser() {

            const data =
                await apiRequest(
                    "/auth/me"
                );


            currentRole =
                data.user?.role || null;

            currentProfile =
                data.profile || null;


            setupRoleNavigation(
                currentRole
            );

            configurePage();

        }

        // =============================================
        // PAGE BY ROLE
        // =============================================

        function configurePage() {

            if (
                currentRole ===
                "student"
            ) {

                if (!currentProfile) {

                    throw new Error(
                        "Student profile not found."
                    );

                }


                openButton.classList.remove(
                    "hidden"
                );

                openButton.textContent =
                    "+ Request Appointment";


                studentSelectGroup
                    .classList
                    .add(
                        "hidden"
                    );


                studentSelect.required =
                    false;


                pageDescription.textContent =
                    "Request and manage your counseling appointments.";


                formTitle.textContent =
                    "Request Counseling Appointment";


                formDescription.textContent =
                    "Complete the information below to request an appointment.";


                submitButton.textContent =
                    "Submit Request";


                listTitle.textContent =
                    "My Appointments";


                listDescription.textContent =
                    "Your counseling appointment history.";


                studentTableHeading.textContent =
                    "Student";


                return;

            }


            if (
                managementRoles.includes(
                    currentRole
                )
            ) {

                openButton.classList.remove(
                    "hidden"
                );

                openButton.textContent =
                    "+ Schedule Appointment";


                studentSelectGroup
                    .classList
                    .remove(
                        "hidden"
                    );


                studentSelect.required =
                    true;


                pageDescription.textContent =
                    "Schedule and manage counseling appointments.";


                formTitle.textContent =
                    "Schedule Counseling Appointment";


                formDescription.textContent =
                    "Select a student, counselor, room, date, and time.";


                submitButton.textContent =
                    "Schedule Appointment";


                listTitle.textContent =
                    "Appointments";


                if (
                    currentRole ===
                    "counselor"
                ) {

                    listDescription.textContent =
                        "Appointments assigned to you.";

                } else {

                    listDescription.textContent =
                        "University counseling appointment records.";

                }


                return;

            }


            openButton.classList.add(
                "hidden"
            );

        }


        // =============================================
        // LOAD STUDENTS
        // =============================================

        async function loadStudents() {

            try {

                const data =
                    await apiRequest(
                        "/students"
                    );


                students =
                    Array.isArray(data)
                        ? data
                        : data.items || [];


                studentSelect.innerHTML =
                    `
                        <option value="">
                            Select student
                        </option>
                    `;


                students.forEach(
                    student => {

                        const option =
                            document.createElement(
                                "option"
                            );


                        option.value =
                            student.id;


                        const name =
                            getStudentName(
                                student
                            );


                        option.textContent =
                            student.student_number
                                ? `${student.student_number} - ${name}`
                                : name;


                        studentSelect
                            .appendChild(
                                option
                            );

                    }
                );


            } catch (error) {

                console.error(
                    "Unable to load students:",
                    error
                );

                showMessage(
                    "Unable to load the student list.",
                    "error"
                );

            }

        }


        // =============================================
        // LOAD COUNSELORS
        // =============================================

        async function loadCounselors() {

            try {

                const data =
                    await apiRequest(
                        "/counselors"
                    );


                counselors =
                    Array.isArray(data)
                        ? data
                        : data.items ||
                          data.counselors ||
                          [];


                counselorSelect.innerHTML =
                    `
                        <option value="">
                            Select counselor
                        </option>
                    `;


                counselors.forEach(
                    counselor => {

                        const option =
                            document.createElement(
                                "option"
                            );


                        option.value =
                            counselor.id;


                        option.textContent =
                            getCounselorName(
                                counselor
                            );


                        if (
                            counselor.specialization
                        ) {

                            option.textContent +=
                                ` - ${counselor.specialization}`;

                        }


                        counselorSelect
                            .appendChild(
                                option
                            );

                    }
                );


            } catch (error) {

                console.error(
                    "Unable to load counselors:",
                    error
                );

                showMessage(
                    "Unable to load counselor list.",
                    "error"
                );

            }

        }


        // =============================================
        // LOAD ROOMS
        // =============================================

        async function loadRooms() {

            try {

                const data =
                    await apiRequest(
                        "/rooms"
                    );


                rooms =
                    Array.isArray(data)
                        ? data
                        : data.items ||
                          data.rooms ||
                          [];


                roomSelect.innerHTML =
                    `
                        <option value="">
                            No room selected
                        </option>
                    `;


                rooms.forEach(
                    room => {

                        const option =
                            document.createElement(
                                "option"
                            );


                        option.value =
                            room.id;


                        option.textContent =
                            room.name;


                        if (room.location) {

                            option.textContent +=
                                ` - ${room.location}`;

                        }


                        roomSelect
                            .appendChild(
                                option
                            );

                    }
                );


            } catch (error) {

                console.error(
                    "Unable to load rooms:",
                    error
                );

            }

        }


        // =============================================
        // LOAD APPOINTMENTS
        // =============================================

        async function loadAppointments() {

            tableBody.innerHTML =
                `
                    <tr>
                        <td
                            colspan="8"
                            class="empty-table"
                        >
                            Loading appointments...
                        </td>
                    </tr>
                `;


            try {

                let endpoint =
                    "/appointments";


                const selectedStatus =
                    statusFilter.value;


                if (selectedStatus) {

                    endpoint +=
                        `?status=${encodeURIComponent(
                            selectedStatus
                        )}`;

                }


                const data =
                    await apiRequest(
                        endpoint
                    );


                const appointments =
                    Array.isArray(data)
                        ? data
                        : data.items ||
                          data.appointments ||
                          [];


                renderAppointments(
                    appointments
                );


            } catch (error) {

                console.error(
                    "Unable to load appointments:",
                    error
                );


                tableBody.innerHTML =
                    `
                        <tr>
                            <td
                                colspan="8"
                                class="empty-table"
                            >
                                Unable to load appointments.
                            </td>
                        </tr>
                    `;

            }

        }


        // =============================================
        // RENDER APPOINTMENTS
        // =============================================

        function renderAppointments(
            appointments
        ) {

            tableBody.innerHTML = "";


            if (
                !appointments ||
                appointments.length === 0
            ) {

                tableBody.innerHTML =
                    `
                        <tr>
                            <td
                                colspan="8"
                                class="empty-table"
                            >
                                No appointments found.
                            </td>
                        </tr>
                    `;

                return;

            }


            appointments.forEach(
                appointment => {

                    const startsAt =
                        new Date(
                            appointment.starts_at
                        );


                    const endsAt =
                        new Date(
                            appointment.ends_at
                        );


                    const counselor =
                        findCounselor(
                            appointment.counselor_id
                        );


                    const room =
                        findRoom(
                            appointment.room_id
                        );


                    const student =
                        findStudent(
                            appointment.student_id
                        );


                    const row =
                        document.createElement(
                            "tr"
                        );


                    row.innerHTML =
                        `
                            <td>
                                ${escapeHtml(
                                    getAppointmentStudentName(
                                        appointment,
                                        student
                                    )
                                )}
                            </td>

                            <td>
                                ${formatDate(
                                    startsAt
                                )}
                            </td>

                            <td>
                                ${formatTime(
                                    startsAt
                                )}
                                -
                                ${formatTime(
                                    endsAt
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    getAppointmentCounselorName(
                                        appointment,
                                        counselor
                                    )
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    room
                                        ? room.name
                                        : "—"
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    appointment.purpose ||
                                    ""
                                )}
                            </td>

                            <td>

                                <span
                                    class="status-badge status-${String(
                                        appointment.status
                                    ).toLowerCase()}"
                                >
                                    ${formatStatus(
                                        appointment.status
                                    )}
                                </span>

                            </td>

                            <td>
                                ${createActions(
                                    appointment
                                )}
                            </td>
                        `;


                    tableBody.appendChild(
                        row
                    );

                }
            );


            bindActionButtons();

        }


        // =============================================
        // CREATE ACTIONS
        // =============================================

        function createActions(
            appointment
        ) {

            const status =
                appointment.status;


            if (
                currentRole ===
                "student"
            ) {

                if (
                    status === "REQUESTED" ||
                    status === "CONFIRMED"
                ) {

                    return `
                        <button
                            type="button"
                            class="table-action-button cancel-appointment-button"
                            data-id="${appointment.id}"
                        >
                            Cancel
                        </button>
                    `;

                }


                return "—";

            }


            if (
                managementRoles.includes(
                    currentRole
                )
            ) {

                if (
                    status === "REQUESTED"
                ) {

                    return `
                        <div class="appointment-actions">

                            <button
                                type="button"
                                class="table-action-button confirm-appointment-button"
                                data-id="${appointment.id}"
                            >
                                Confirm
                            </button>

                            <button
                                type="button"
                                class="table-action-button cancel-appointment-button"
                                data-id="${appointment.id}"
                            >
                                Cancel
                            </button>

                        </div>
                    `;

                }


                if (
                    status === "CONFIRMED"
                ) {

                    return `
                        <div class="appointment-actions">

                            <button
                                type="button"
                                class="table-action-button complete-appointment-button"
                                data-id="${appointment.id}"
                            >
                                Complete
                            </button>

                            <button
                                type="button"
                                class="table-action-button no-show-appointment-button"
                                data-id="${appointment.id}"
                            >
                                No Show
                            </button>

                            <button
                                type="button"
                                class="table-action-button cancel-appointment-button"
                                data-id="${appointment.id}"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                class="table-action-button print-appointment-button"
                                data-id="${appointment.id}"
                            >
                                Print Slip
                            </button>

                        </div>
                    `;
                }


                return "—";

            }


            return "—";

        }

        // =============================================
        // BIND ACTION BUTTONS
        // =============================================

        function bindActionButtons() {

            document
                .querySelectorAll(
                    ".confirm-appointment-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                updateStatus(
                                    button.dataset.id,
                                    "CONFIRMED"
                                );

                            }
                        );

                    }
                );


            document
                .querySelectorAll(
                    ".complete-appointment-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                updateStatus(
                                    button.dataset.id,
                                    "COMPLETED"
                                );

                            }
                        );

                    }
                );


            document
                .querySelectorAll(
                    ".no-show-appointment-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                updateStatus(
                                    button.dataset.id,
                                    "NO_SHOW"
                                );

                            }
                        );

                    }
                );


            document
                .querySelectorAll(
                    ".cancel-appointment-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                cancelAppointment(
                                    button.dataset.id
                                );

                            }
                        );

                    }
                );


            document
                .querySelectorAll(
                    ".print-appointment-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                printAppointmentSlip(
                                    button.dataset.id
                                );

                            }
                        );

                    }
                );

        }
                     
// =============================================
// PRINT APPOINTMENT CONFIRMATION SLIP
// =============================================

async function printAppointmentSlip(
    appointmentId
) {

    try {

        const response = await apiDownload(
            `/reports/appointments/${appointmentId}/confirmation.pdf`
        );
        if (!response) {
            return;
        }


        if (!response.ok) {

            let message =
                "Unable to generate the appointment confirmation slip.";

            try {

                const errorData =
                    await response.json();

                message =
                    errorData.message ||
                    errorData.error ||
                    message;

            } catch (error) {

                console.error(
                    "Unable to read PDF error response:",
                    error
                );

            }

            throw new Error(
                message
            );

        }


        const pdfBlob =
            await response.blob();


        const pdfUrl =
            URL.createObjectURL(
                pdfBlob
            );


        const printWindow =
            window.open(
                pdfUrl,
                "_blank"
            );


        if (!printWindow) {

            URL.revokeObjectURL(
                pdfUrl
            );

            throw new Error(
                "The browser blocked the PDF window. Please allow pop-ups and try again."
            );

        }


        setTimeout(
            () => {

                URL.revokeObjectURL(
                    pdfUrl
                );

            },
            60000
        );


    } catch (error) {

        console.error(
            "Unable to print appointment slip:",
            error
        );


        showMessage(
            error.message ||
            "Unable to generate the appointment confirmation slip.",
            "error"
        );

    }

}

        // =============================================
        // CREATE APPOINTMENT
        // =============================================

        appointmentForm.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                hideMessage();


                let studentId;


                if (
                    currentRole ===
                    "student"
                ) {

                    studentId =
                        currentProfile?.id;

                } else {

                    studentId =
                        Number(
                            studentSelect.value
                        );

                }


                if (!studentId) {

                    showMessage(
                        "Please select a student.",
                        "error"
                    );

                    return;

                }


                if (
                    !counselorSelect.value
                ) {

                    showMessage(
                        "Please select a counselor.",
                        "error"
                    );

                    return;

                }


                const date =
                    document.getElementById(
                        "appointmentDate"
                    ).value;


                const startTime =
                    document.getElementById(
                        "startTime"
                    ).value;


                const endTime =
                    document.getElementById(
                        "endTime"
                    ).value;


                const purpose =
                    document.getElementById(
                        "appointmentPurpose"
                    )
                    .value
                    .trim();


                if (
                    !date ||
                    !startTime ||
                    !endTime
                ) {

                    showMessage(
                        "Please complete the appointment date and time.",
                        "error"
                    );

                    return;

                }


                if (!purpose) {

                    showMessage(
                        "Please enter the appointment purpose.",
                        "error"
                    );

                    return;

                }


                const startsAt =
                    new Date(
                        `${date}T${startTime}`
                    );


                const endsAt =
                    new Date(
                        `${date}T${endTime}`
                    );


                if (
                    endsAt <= startsAt
                ) {

                    showMessage(
                        "End time must be later than the start time.",
                        "error"
                    );

                    return;

                }


                const duration =
                    endsAt - startsAt;


                if (
                    duration >
                    4 * 60 * 60 * 1000
                ) {

                    showMessage(
                        "An appointment cannot exceed 4 hours.",
                        "error"
                    );

                    return;

                }


                const payload = {

                    student_id: Number(studentId),

                    counselor_id: Number(counselorSelect.value),

                    // Send the exact local date/time selected by the user.
                    starts_at: `${date}T${startTime}:00`,

                    ends_at: `${date}T${endTime}:00`,

                    purpose: purpose

                };


                if (roomSelect.value) {

                    payload.room_id =
                        Number(
                            roomSelect.value
                        );

                }


                submitButton.disabled =
                    true;


                submitButton.textContent =
                    currentRole === "student"
                        ? "Submitting..."
                        : "Scheduling...";


                try {

                    await apiRequest(
                        "/appointments",
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
                        currentRole === "student"
                            ? "Appointment request submitted successfully."
                            : "Appointment scheduled successfully.",
                        "success"
                    );


                    appointmentForm.reset();


                    appointmentFormSection
                        .classList
                        .add(
                            "hidden"
                        );


                    await loadAppointments();


                } catch (error) {

                    console.error(
                        "Appointment creation failed:",
                        error
                    );


                    let message =
                        error?.data?.message ||
                        error?.data?.error ||
                        "Unable to create the appointment.";


                    if (
                        error?.data?.code ===
                        "schedule_conflict"
                    ) {

                        message =
                            "This schedule conflicts with an existing appointment. Please select another time, counselor, or room.";

                    }


                    showMessage(
                        message,
                        "error"
                    );


                } finally {

                    submitButton.disabled =
                        false;


                    submitButton.textContent =
                        currentRole === "student"
                            ? "Submit Request"
                            : "Schedule Appointment";

                }

            }
        );

        // =============================================
        // CUSTOM CONFIRMATION MODAL
        // =============================================

        function showConfirmModal({
            title,
            message,
            confirmText = "Confirm",
            icon = "?"
        }) {

            return new Promise(resolve => {

                const modal =
                    document.getElementById(
                        "appointmentConfirmModal"
                    );

                const titleElement =
                    document.getElementById(
                        "confirmModalTitle"
                    );

                const messageElement =
                    document.getElementById(
                        "confirmModalMessage"
                    );

                const iconElement =
                    document.getElementById(
                        "confirmModalIcon"
                    );

                const confirmButton =
                    document.getElementById(
                        "confirmModalConfirm"
                    );

                const cancelButton =
                    document.getElementById(
                        "confirmModalCancel"
                    );

                const backdrop =
                    modal.querySelector(
                        ".confirm-modal-backdrop"
                    );


                titleElement.textContent =
                    title;

                messageElement.textContent =
                    message;

                confirmButton.textContent =
                    confirmText;

                iconElement.textContent =
                    icon;


                modal.classList.remove(
                    "hidden"
                );


                function closeModal(result) {

                    modal.classList.add(
                        "hidden"
                    );

                    confirmButton.removeEventListener(
                        "click",
                        handleConfirm
                    );

                    cancelButton.removeEventListener(
                        "click",
                        handleCancel
                    );

                    backdrop.removeEventListener(
                        "click",
                        handleCancel
                    );

                    document.removeEventListener(
                        "keydown",
                        handleKeyboard
                    );

                    resolve(result);

                }


                function handleConfirm() {
                    closeModal(true);
                }


                function handleCancel() {
                    closeModal(false);
                }


                function handleKeyboard(event) {

                    if (event.key === "Escape") {
                        closeModal(false);
                    }

                }


                confirmButton.addEventListener(
                    "click",
                    handleConfirm
                );

                cancelButton.addEventListener(
                    "click",
                    handleCancel
                );

                backdrop.addEventListener(
                    "click",
                    handleCancel
                );

                document.addEventListener(
                    "keydown",
                    handleKeyboard
                );

            });

        }

        // =============================================
        // UPDATE STATUS
        // =============================================

        async function updateStatus(
            appointmentId,
            status
        ) {

            let confirmed = false;

            if (status === "CONFIRMED") {

                confirmed = await showConfirmModal({
                    title: "Confirm Appointment",
                    message:
                        "Are you sure you want to confirm this counseling appointment?",
                    confirmText: "Confirm",
                    icon: "✓"
                });

            } else if (status === "COMPLETED") {

                confirmed = await showConfirmModal({
                    title: "Complete Appointment",
                    message:
                        "Mark this counseling appointment as completed?",
                    confirmText: "Complete",
                    icon: "✓"
                });

            } else if (status === "NO_SHOW") {

                confirmed = await showConfirmModal({
                    title: "Mark as No Show",
                    message:
                        "Are you sure you want to mark the student as a no show?",
                    confirmText: "Mark No Show",
                    icon: "!"
                });

            } else {

                confirmed = await showConfirmModal({
                    title: "Update Appointment",
                    message:
                        "Are you sure you want to update this appointment?",
                    confirmText: "Continue",
                    icon: "?"
                });

            }

            if (!confirmed) {
                return;
            }


            try {

                await apiRequest(
                    `/appointments/${appointmentId}/status`,
                    {
                        method:
                            "PATCH",

                        body:
                            JSON.stringify({
                                status:
                                    status
                            })
                    }
                );


                showMessage(
                    `Appointment status changed to ${formatStatus(
                        status
                    )}.`,
                    "success"
                );


                await loadAppointments();


            } catch (error) {

                console.error(
                    "Unable to update appointment:",
                    error
                );


                let message =
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to update the appointment.";


                if (
                    error?.data?.code ===
                    "schedule_conflict"
                ) {

                    message =
                        "This appointment cannot be confirmed because its schedule now conflicts with another appointment.";

                }


                showMessage(
                    message,
                    "error"
                );

            }

        }


        // =============================================
        // CANCEL
        // =============================================

        async function cancelAppointment(
            appointmentId
        ) {

            const confirmed =
                await showConfirmModal({
                    title: "Cancel Appointment",
                    message:
                        "Are you sure you want to cancel this counseling appointment?",
                    confirmText: "Cancel Appointment",
                    icon: "!"
                });

            if (!confirmed) {
                return;
            }


            try {

                await apiRequest(
                    `/appointments/${appointmentId}/cancel`,
                    {
                        method:
                            "PATCH",

                        body:
                            JSON.stringify({})
                    }
                );


                showMessage(
                    "Appointment cancelled successfully.",
                    "success"
                );


                await loadAppointments();


            } catch (error) {

                console.error(
                    "Cancellation failed:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to cancel this appointment.",
                    "error"
                );

            }

        }


        // =============================================
        // OPEN FORM
        // =============================================

        openButton.addEventListener(
            "click",
            () => {

                appointmentFormSection
                    .classList
                    .remove(
                        "hidden"
                    );


                appointmentFormSection
                    .scrollIntoView({
                        behavior:
                            "smooth",

                        block:
                            "start"
                    });

            }
        );


        // =============================================
        // CLOSE FORM
        // =============================================

        function closeForm() {

            appointmentFormSection
                .classList
                .add(
                    "hidden"
                );

        }


        document
            .getElementById(
                "closeAppointmentForm"
            )
            .addEventListener(
                "click",
                closeForm
            );


        document
            .getElementById(
                "cancelFormButton"
            )
            .addEventListener(
                "click",
                closeForm
            );


        // =============================================
        // FILTER
        // =============================================

        statusFilter.addEventListener(
            "change",
            loadAppointments
        );

        // =============================================
        // SHARED SIDEBAR NAVIGATION
        // =============================================

        const dashboardNav =
            document.getElementById(
                "dashboardNav"
            );

        const casesNav =
            document.getElementById(
                "casesNav"
            );

        const referralsNav =
            document.getElementById(
                "referralsNav"
            );

        const exitNav =
            document.getElementById(
                "exitNav"
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


        if (dashboardNav) {

            dashboardNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/dashboard";

                }
            );

        }


        if (casesNav) {

            casesNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/cases";

                }
            );

        }


        if (referralsNav) {

            referralsNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/referrals";

                }
            );

        }


        if (exitNav) {

            exitNav.addEventListener(
                "click",
                () => {

                    if (
                        currentRole === "admin" ||
                        currentRole === "head_counselor" ||
                        currentRole === "staff"
                    ) {

                        window.location.href =
                            "/manage-exit-questionnaire";

                    } else {

                        window.location.href =
                            "/exit-questionnaire";

                    }

                }
            );

        }


        if (clearanceNav) {

            clearanceNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/clearance";

                }
            );

        }


        if (adminNav) {

            adminNav.addEventListener(
                "click",
                () => {

                    if (
                        currentRole === "admin"
                    ) {

                        window.location.href =
                            "/admin-management";

                    }

                }
            );

        }


        if (profileButton) {

            profileButton.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/dashboard";

                }
            );

        }

        // =============================================
        // LOGOUT
        // =============================================

        document
            .getElementById(
                "logoutButton"
            )
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


        // =============================================
        // HELPERS
        // =============================================

        function findStudent(
            id
        ) {

            return students.find(
                student =>
                    Number(
                        student.id
                    ) ===
                    Number(id)
            );

        }


        function findCounselor(
            id
        ) {

            return counselors.find(
                counselor =>
                    Number(
                        counselor.id
                    ) ===
                    Number(id)
            );

        }


        function findRoom(
            id
        ) {

            if (!id) {
                return null;
            }


            return rooms.find(
                room =>
                    Number(
                        room.id
                    ) ===
                    Number(id)
            );

        }


        function getStudentName(
            student
        ) {

            if (!student) {
                return "Student";
            }


            if (student.full_name) {
                return student.full_name;
            }


            const name =
                `${student.first_name || ""} ${student.last_name || ""}`
                    .trim();


            return name || "Student";

        }


        function getCounselorName(
            counselor
        ) {

            if (!counselor) {
                return "Counselor";
            }


            if (counselor.full_name) {
                return counselor.full_name;
            }


            const name =
                `${counselor.first_name || ""} ${counselor.last_name || ""}`
                    .trim();


            return name || "Counselor";

        }


        function getAppointmentStudentName(
            appointment,
            student
        ) {

            if (
                currentRole === "student" &&
                currentProfile
            ) {

                return getStudentName(
                    currentProfile
                );

            }


            if (student) {

                return getStudentName(
                    student
                );

            }


            if (appointment.student) {

                return getStudentName(
                    appointment.student
                );

            }


            return `Student #${appointment.student_id}`;

        }


        function getAppointmentCounselorName(
            appointment,
            counselor
        ) {

            if (counselor) {

                return getCounselorName(
                    counselor
                );

            }


            if (appointment.counselor) {

                return getCounselorName(
                    appointment.counselor
                );

            }


            return "Counselor";

        }


        function formatDate(
            date
        ) {

            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {
                return "—";
            }


            return date.toLocaleDateString(
                undefined,
                {
                    year:
                        "numeric",

                    month:
                        "short",

                    day:
                        "numeric"
                }
            );

        }


            function formatTime(date) {

                if (
                    Number.isNaN(
                        date.getTime()
                    )
                ) {
                    return "—";
                }

                return date.toLocaleTimeString(
                    "en-US",
                    {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true
                    }
                );
            }


        function formatStatus(
            status
        ) {

            if (!status) {
                return "—";
            }


            return String(
                status
            ).replaceAll(
                "_",
                " "
            );

        }


        function escapeHtml(
            value
        ) {

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


        function showMessage(
            message,
            type
        ) {

            messageBox.textContent =
                message;


            messageBox.className =
                `message ${type}`;


            window.scrollTo({
                top:
                    0,

                behavior:
                    "smooth"
            });

        }


        function hideMessage() {

            messageBox.textContent =
                "";


            messageBox.className =
                "message hidden";

        }

    }
);
