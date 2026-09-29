const API_BASE = "/api/v1";

async function readResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }
    return response.text();
}


// =========================================================
// TOKEN HELPERS
// =========================================================

function getAccessToken() {
    return localStorage.getItem("access_token");
}


function getRefreshToken() {
    return localStorage.getItem("refresh_token");
}


function getStoredUser() {
    const raw = localStorage.getItem("user");

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}


function getStoredProfile() {
    const raw = localStorage.getItem("profile");

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}


// =========================================================
// SESSION
// =========================================================

function saveSession(data) {

    if (data.access_token) {
        localStorage.setItem(
            "access_token",
            data.access_token
        );
    }

    if (data.refresh_token) {
        localStorage.setItem(
            "refresh_token",
            data.refresh_token
        );
    }

    if (data.user) {
        localStorage.setItem(
            "user",
            JSON.stringify(data.user)
        );
    }

    if (Object.prototype.hasOwnProperty.call(data, "profile")) {
        localStorage.setItem(
            "profile",
            JSON.stringify(data.profile)
        );
    }
}


function clearSession() {

    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    localStorage.removeItem("profile");
}


// =========================================================
// REFRESH TOKEN
// =========================================================

async function refreshAccessToken() {

    const refreshToken =
        getRefreshToken();

    if (!refreshToken) {
        return false;
    }

    try {

        const response = await fetch(
            `${API_BASE}/auth/refresh`,
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${refreshToken}`
                }
            }
        );


        if (!response.ok) {
            return false;
        }


        const data =
            await response.json();


        if (!data.access_token) {
            return false;
        }


        localStorage.setItem(
            "access_token",
            data.access_token
        );


        return true;

    } catch (error) {

        console.error(
            "Refresh token failed:",
            error
        );

        return false;
    }
}


// =========================================================
// API REQUEST
// =========================================================

async function apiRequest(
    endpoint,
    options = {}
) {

    const token =
        getAccessToken();


    const headers = {
        ...(options.headers || {})
    };


    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] =
            "application/json";
    }


    if (token) {
        headers["Authorization"] =
            `Bearer ${token}`;
    }


    const response = await fetch(
        `${API_BASE}${endpoint}`,
        {
            ...options,
            headers
        }
    );


    const data = await readResponse(response);


    // =====================================================
    // ACCESS TOKEN EXPIRED
    // =====================================================

    if (
        response.status === 401 &&
        data?.error === "token_expired"
    ) {

        const refreshed =
            await refreshAccessToken();


        if (refreshed) {

            headers["Authorization"] =
                `Bearer ${getAccessToken()}`;


            const retryResponse =
                await fetch(
                    `${API_BASE}${endpoint}`,
                    {
                        ...options,
                        headers
                    }
                );


            const retryData = await readResponse(retryResponse);


            if (!retryResponse.ok) {

                throw {
                    status:
                        retryResponse.status,

                    data:
                        retryData
                };
            }


            return retryData;
        }


        clearSession();

        window.location.href = "/";

        return;
    }


    // A revoked, invalid, or missing session cannot be repaired by retrying.
    // Clear local state so protected pages do not remain stuck in a bad session.
    const sessionErrors = [
        "authorization_required",
        "invalid_token",
        "token_revoked"
    ];
    if (
        response.status === 401 &&
        sessionErrors.includes(data?.error) &&
        !endpoint.startsWith("/auth/")
    ) {
        clearSession();
        window.location.href = "/";
        return;
    }


    // =====================================================
    // OTHER ERRORS
    // =====================================================

    if (!response.ok) {

        throw {
            status:
                response.status,

            data
        };
    }


    return data;
}


async function apiDownload(endpoint, options = {}) {
    const token = getAccessToken();
    const headers = { ...(options.headers || {}) };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    if (response.status === 401) {
        const data = await readResponse(response);
        if (data?.error === "token_expired" && await refreshAccessToken()) {
            headers.Authorization = `Bearer ${getAccessToken()}`;
            response = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers
            });
        } else {
            clearSession();
            window.location.href = "/";
            return null;
        }
    }

    if (!response.ok) {
        const data = await readResponse(response);
        throw {
            status: response.status,
            data,
            message: data?.message || data?.error || "Unable to download the report."
        };
    }

    return response;
}


// =========================================================
// AUTH GUARD
// =========================================================

function requireLogin() {

    if (!getAccessToken()) {

        window.location.href = "/";

        return false;
    }


    return true;
}
