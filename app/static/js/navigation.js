// =====================================================
// SHARED ROLE-BASED NAVIGATION
// =====================================================

function setupRoleNavigation(role) {

    const appointments =
        document.getElementById("appointmentsNav");

    const referrals =
        document.getElementById("referralsNav");

    const exit =
        document.getElementById("exitNav");

    const clearance =
        document.getElementById("clearanceNav");

    const cases =
        document.getElementById("casesNav");

    const admin =
        document.getElementById("adminNav");


    // =================================================
    // HIDE ROLE-CONTROLLED NAVIGATION FIRST
    // =================================================

    [
        appointments,
        referrals,
        exit,
        clearance,
        cases,
        admin
    ].forEach(item => {

        if (item) {
            item.style.display = "none";
        }

    });


    // =================================================
    // STUDENT
    // =================================================

    if (role === "student") {

        showNav(appointments);
        showNav(cases);
        showNav(referrals);
        showNav(exit);
        showNav(clearance);

        setNavText(
            referrals,
            "Anonymous Peer Referral"
        );
    }


    // =================================================
    // COUNSELOR
    // =================================================

    else if (role === "counselor") {

        showNav(appointments);
        showNav(cases);
        showNav(referrals);

        setNavText(
            referrals,
            "Referrals"
        );
    }


    // =================================================
    // HEAD COUNSELOR
    // =================================================

    else if (role === "head_counselor") {

        showNav(appointments);
        showNav(cases);
        showNav(referrals);
        showNav(exit);
        showNav(clearance);

        setNavText(
            referrals,
            "Referrals"
        );
    }


    // =================================================
    // ADMIN
    // =================================================

    else if (role === "admin") {

        showNav(appointments);
        showNav(cases);
        showNav(referrals);
        showNav(exit);
        showNav(clearance);
        showNav(admin);

        setNavText(
            referrals,
            "Referrals"
        );
    }


    // =================================================
    // STAFF
    // =================================================

    else if (role === "staff") {

        showNav(exit);
        showNav(clearance);
    }

}


// =====================================================
// SHOW NAV ITEM
// =====================================================

function showNav(element) {

    if (element) {
        element.style.display = "flex";
    }

}


// =====================================================
// CHANGE NAV LABEL
// =====================================================

function setNavText(
    element,
    text
) {

    if (element) {
        element.textContent = text;
    }

}