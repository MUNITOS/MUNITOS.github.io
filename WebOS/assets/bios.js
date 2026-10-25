(function () {
    "use strict";
    const FILE_VERSION='1.0';
    const RUNTIME_KEY='__MUNITOS_RECOVERY_RUNTIME__';
    if (window[RUNTIME_KEY] && typeof window[RUNTIME_KEY].destroy === "function") {
        return;
    }
    const NS = "http://www.w3.org/2000/svg";
    const STORE = Object.freeze({
        CONFIG: 'munitos_recovery_config_v1',
        REVISION: 'munitos_recovery_revision_v1',
        RESTART: 'munitos_recovery_restart_v1',
        SEED: 'munitos_recovery_session_seed_v1'
    });
    const SYSTEM_COOKIE_KEYS=Object.freeze(['munitos_install_wizard_completed','munitos_install_wizard_state']);
    const SYSTEM_INDEXEDDB_NAMES=Object.freeze(['munitos-vfs-v1']);
    const SYSTEM_CACHE_NAMES=Object.freeze(['munitos-package-runtime-v1-v1']);
    const SYSTEM_STORAGE_KEYS=Object.freeze([
        'munitos-install-wizard:completed:v1','munitos-install-wizard:state:v1',
        'munitos-terminal-ui:pkg-cache:v1:1','munitos-terminal-ui:pkg-registry:v1',
        'munitos-terminal-ui:pkg-state:v1','munitos-terminal-ui:v1','munitos:vfs:v1',
        'munitos_recovery_config_v1','munitos_recovery_restart_v1','munitos_recovery_revision_v1',
        'munitos_recovery_session_seed_v1'
    ]);
    const ROUTES = Object.freeze([
        "main",
        "run-light-munitos",
        "system-recovery",
        "country-select",
        "feature-settings",
        "profile-select",
        "online-help",
        "proxy-settings"
    ]);
    const STATES = Object.freeze({
        IDLE: "IDLE",
        CONFIG_CHANGED: "CONFIG_CHANGED",
        RESTART_REQUIRED: "RESTART_REQUIRED",
        RESTART_REQUESTED: "RESTART_REQUESTED",
        READY_AFTER_RESTART: "READY_AFTER_RESTART",
        RUNNING: "RUNNING"
    });
    const DEFAULT_CONFIG = Object.freeze({
        enabled: false,
        profile: "munitos",
        country: "US",
        features: Object.freeze({
            webRTCBlock: true,
            canvasSpoof: true,
            audioSpoof: true,
            fontSpoof: true,
            timezoneSpoof: true,
            permissionsSpoof: true,
            mediaDevicesSpoof: true,
            webGPUSpoof: true,
            themeSpoof: true,
            hdrSpoof: true,
            colorGamutSpoof: true,
            pwaSpoof: true,
            referrerSpoof: true,
            touchSpoof: true,
            webdriverBlock: true,
            privateMode: false,
            batterySpoof: true,
            geoSpoof: true,
            workerSpoof: true,
            orientationSpoof: true,
            speechSpoof: true,
            bluetoothSpoof: true,
            usbSpoof: true,
            storageSpoof: true
        })
    });
    const COUNTRIES = {
        US: { name: "United States", tz: "America/New_York", lang: "en-US", langs: ["en-US", "en"], ipv4: "73.168.45.23", ipv6: "2600:1700:4521:8b01::1", localIP: "192.168.1.100", mDNS: "a1b2c3d4.local", webRTC: ["73.168.45.23", "2600:1700:4521:8b01::1"], geo: { lat: 40.7128, lon: -74.006, acc: 50 }, locale: "en-US", currency: "USD", cc: "US" },
        CN: { name: "China", tz: "Asia/Shanghai", lang: "zh-CN", langs: ["zh-CN", "zh"], ipv4: "114.114.114.114", ipv6: "2400:3200::1", localIP: "192.168.1.101", mDNS: "b2c3d4e5.local", webRTC: ["114.114.114.114", "2400:3200::1"], geo: { lat: 31.2304, lon: 121.4737, acc: 100 }, locale: "zh-CN", currency: "CNY", cc: "CN" },
        JP: { name: "Japan", tz: "Asia/Tokyo", lang: "ja-JP", langs: ["ja-JP", "ja"], ipv4: "133.242.254.1", ipv6: "2400:8500:1301:1::1", localIP: "192.168.1.102", mDNS: "c3d4e5f6.local", webRTC: ["133.242.254.1", "2400:8500:1301:1::1"], geo: { lat: 35.6762, lon: 139.6503, acc: 30 }, locale: "ja-JP", currency: "JPY", cc: "JP" },
        DE: { name: "Germany", tz: "Europe/Berlin", lang: "de-DE", langs: ["de-DE", "de"], ipv4: "85.214.132.1", ipv6: "2a01:4f8:100:1::1", localIP: "192.168.1.103", mDNS: "d4e5f6g7.local", webRTC: ["85.214.132.1", "2a01:4f8:100:1::1"], geo: { lat: 52.52, lon: 13.405, acc: 40 }, locale: "de-DE", currency: "EUR", cc: "DE" },
        IN: { name: "India", tz: "Asia/Kolkata", lang: "en-IN", langs: ["en-IN", "en", "hi-IN"], ipv4: "103.21.58.1", ipv6: "2401:4900:1::1", localIP: "192.168.1.104", mDNS: "e5f6g7h8.local", webRTC: ["103.21.58.1", "2401:4900:1::1"], geo: { lat: 28.6139, lon: 77.209, acc: 80 }, locale: "en-IN", currency: "INR", cc: "IN" },
        GB: { name: "United Kingdom", tz: "Europe/London", lang: "en-GB", langs: ["en-GB", "en"], ipv4: "81.2.69.142", ipv6: "2a00:1450:4001:801::200e", localIP: "192.168.1.105", mDNS: "f6g7h8i9.local", webRTC: ["81.2.69.142", "2a00:1450:4001:801::200e"], geo: { lat: 51.5074, lon: -0.1278, acc: 35 }, locale: "en-GB", currency: "GBP", cc: "GB" },
        FR: { name: "France", tz: "Europe/Paris", lang: "fr-FR", langs: ["fr-FR", "fr"], ipv4: "176.31.128.1", ipv6: "2001:41d0:1:1::1", localIP: "192.168.1.106", mDNS: "g7h8i9j0.local", webRTC: ["176.31.128.1", "2001:41d0:1:1::1"], geo: { lat: 48.8566, lon: 2.3522, acc: 40 }, locale: "fr-FR", currency: "EUR", cc: "FR" },
        IT: { name: "Italy", tz: "Europe/Rome", lang: "it-IT", langs: ["it-IT", "it"], ipv4: "95.110.1.1", ipv6: "2a00:2000::1", localIP: "192.168.1.107", mDNS: "h8i9j0k1.local", webRTC: ["95.110.1.1", "2a00:2000::1"], geo: { lat: 41.9028, lon: 12.4964, acc: 45 }, locale: "it-IT", currency: "EUR", cc: "IT" },
        BR: { name: "Brazil", tz: "America/Sao_Paulo", lang: "pt-BR", langs: ["pt-BR", "pt"], ipv4: "177.54.1.1", ipv6: "2804:1::1", localIP: "192.168.1.108", mDNS: "i9j0k1l2.local", webRTC: ["177.54.1.1", "2804:1::1"], geo: { lat: -23.5505, lon: -46.6333, acc: 90 }, locale: "pt-BR", currency: "BRL", cc: "BR" },
        CA: { name: "Canada", tz: "America/Toronto", lang: "en-CA", langs: ["en-CA", "en", "fr-CA"], ipv4: "99.231.1.1", ipv6: "2607:f8b0:4000::1", localIP: "192.168.1.109", mDNS: "j0k1l2m3.local", webRTC: ["99.231.1.1", "2607:f8b0:4000::1"], geo: { lat: 43.6532, lon: -79.3832, acc: 40 }, locale: "en-CA", currency: "CAD", cc: "CA" },
        KR: { name: "South Korea", tz: "Asia/Seoul", lang: "ko-KR", langs: ["ko-KR", "ko"], ipv4: "121.78.128.1", ipv6: "2400:cb00:1::1", localIP: "192.168.1.110", mDNS: "k1l2m3n4.local", webRTC: ["121.78.128.1", "2400:cb00:1::1"], geo: { lat: 37.5665, lon: 126.978, acc: 30 }, locale: "ko-KR", currency: "KRW", cc: "KR" },
        RU: { name: "Russia", tz: "Europe/Moscow", lang: "ru-RU", langs: ["ru-RU", "ru"], ipv4: "5.45.192.1", ipv6: "2a02:6b8:0:1::1", localIP: "192.168.1.111", mDNS: "l2m3n4o5.local", webRTC: ["5.45.192.1", "2a02:6b8:0:1::1"], geo: { lat: 55.7558, lon: 37.6173, acc: 60 }, locale: "ru-RU", currency: "RUB", cc: "RU" },
        AU: { name: "Australia", tz: "Australia/Sydney", lang: "en-AU", langs: ["en-AU", "en"], ipv4: "103.10.1.1", ipv6: "2400:c400::1", localIP: "192.168.1.112", mDNS: "m3n4o5p6.local", webRTC: ["103.10.1.1", "2400:c400::1"], geo: { lat: -33.8688, lon: 151.2093, acc: 40 }, locale: "en-AU", currency: "AUD", cc: "AU" },
        ES: { name: "Spain", tz: "Europe/Madrid", lang: "es-ES", langs: ["es-ES", "es"], ipv4: "83.32.1.1", ipv6: "2a02:2e0:1::1", localIP: "192.168.1.113", mDNS: "n4o5p6q7.local", webRTC: ["83.32.1.1", "2a02:2e0:1::1"], geo: { lat: 40.4168, lon: -3.7038, acc: 45 }, locale: "es-ES", currency: "EUR", cc: "ES" },
        MX: { name: "Mexico", tz: "America/Mexico_City", lang: "es-MX", langs: ["es-MX", "es"], ipv4: "201.174.1.1", ipv6: "2806:1000::1", localIP: "192.168.1.114", mDNS: "o5p6q7r8.local", webRTC: ["201.174.1.1", "2806:1000::1"], geo: { lat: 19.4326, lon: -99.1332, acc: 70 }, locale: "es-MX", currency: "MXN", cc: "MX" },
        ID: { name: "Indonesia", tz: "Asia/Jakarta", lang: "id-ID", langs: ["id-ID", "id"], ipv4: "103.23.1.1", ipv6: "2400:4800::1", localIP: "192.168.1.115", mDNS: "p6q7r8s9.local", webRTC: ["103.23.1.1", "2400:4800::1"], geo: { lat: -6.2088, lon: 106.8456, acc: 80 }, locale: "id-ID", currency: "IDR", cc: "ID" },
        NL: { name: "Netherlands", tz: "Europe/Amsterdam", lang: "nl-NL", langs: ["nl-NL", "nl"], ipv4: "37.48.1.1", ipv6: "2a01:7c8:1::1", localIP: "192.168.1.116", mDNS: "q7r8s9t0.local", webRTC: ["37.48.1.1", "2a01:7c8:1::1"], geo: { lat: 52.3676, lon: 4.9041, acc: 30 }, locale: "nl-NL", currency: "EUR", cc: "NL" },
        SA: { name: "Saudi Arabia", tz: "Asia/Riyadh", lang: "ar-SA", langs: ["ar-SA", "ar"], ipv4: "5.160.1.1", ipv6: "2a02:cb00::1", localIP: "192.168.1.117", mDNS: "r8s9t0u1.local", webRTC: ["5.160.1.1", "2a02:cb00::1"], geo: { lat: 24.7136, lon: 46.6753, acc: 60 }, locale: "ar-SA", currency: "SAR", cc: "SA" },
        TR: { name: "Turkey", tz: "Europe/Istanbul", lang: "tr-TR", langs: ["tr-TR", "tr"], ipv4: "88.240.12.1", ipv6: "2a02:ff0:1::1", localIP: "192.168.1.118", mDNS: "s9t0u1v2.local", webRTC: ["88.240.12.1", "2a02:ff0:1::1"], geo: { lat: 41.0082, lon: 28.9784, acc: 50 }, locale: "tr-TR", currency: "TRY", cc: "TR" },
        CH: { name: "Switzerland", tz: "Europe/Zurich", lang: "de-CH", langs: ["de-CH", "de", "fr-CH"], ipv4: "185.84.1.1", ipv6: "2a01:4a00::1", localIP: "192.168.1.119", mDNS: "t0u1v2w3.local", webRTC: ["185.84.1.1", "2a01:4a00::1"], geo: { lat: 47.3769, lon: 8.5417, acc: 25 }, locale: "de-CH", currency: "CHF", cc: "CH" },
        PL: { name: "Poland", tz: "Europe/Warsaw", lang: "pl-PL", langs: ["pl-PL", "pl"], ipv4: "5.173.1.1", ipv6: "2a01:6500::1", localIP: "192.168.1.120", mDNS: "u1v2w3x4.local", webRTC: ["5.173.1.1", "2a01:6500::1"], geo: { lat: 52.2297, lon: 21.0122, acc: 40 }, locale: "pl-PL", currency: "PLN", cc: "PL" },
        SE: { name: "Sweden", tz: "Europe/Stockholm", lang: "sv-SE", langs: ["sv-SE", "sv"], ipv4: "85.24.1.1", ipv6: "2a00:1a28::1", localIP: "192.168.1.121", mDNS: "v2w3x4y5.local", webRTC: ["85.24.1.1", "2a00:1a28::1"], geo: { lat: 59.3293, lon: 18.0686, acc: 30 }, locale: "sv-SE", currency: "SEK", cc: "SE" },
        BE: { name: "Belgium", tz: "Europe/Brussels", lang: "nl-BE", langs: ["nl-BE", "nl", "fr-BE"], ipv4: "188.118.1.1", ipv6: "2a02:578::1", localIP: "192.168.1.122", mDNS: "w3x4y5z6.local", webRTC: ["188.118.1.1", "2a02:578::1"], geo: { lat: 50.8503, lon: 4.3517, acc: 30 }, locale: "nl-BE", currency: "EUR", cc: "BE" },
        AR: { name: "Argentina", tz: "America/Argentina/Buenos_Aires", lang: "es-AR", langs: ["es-AR", "es"], ipv4: "190.247.1.1", ipv6: "2800:1::1", localIP: "192.168.1.123", mDNS: "x4y5z6a7.local", webRTC: ["190.247.1.1", "2800:1::1"], geo: { lat: -34.6037, lon: -58.3816, acc: 60 }, locale: "es-AR", currency: "ARS", cc: "AR" },
        NO: { name: "Norway", tz: "Europe/Oslo", lang: "no-NO", langs: ["no-NO", "no", "nb-NO"], ipv4: "77.53.1.1", ipv6: "2a01:5c60::1", localIP: "192.168.1.124", mDNS: "y5z6a7b8.local", webRTC: ["77.53.1.1", "2a01:5c60::1"], geo: { lat: 59.9139, lon: 10.7522, acc: 30 }, locale: "no-NO", currency: "NOK", cc: "NO" },
        AT: { name: "Austria", tz: "Europe/Vienna", lang: "de-AT", langs: ["de-AT", "de"], ipv4: "185.17.1.1", ipv6: "2a02:538::1", localIP: "192.168.1.125", mDNS: "z6a7b8c9.local", webRTC: ["185.17.1.1", "2a02:538::1"], geo: { lat: 48.2082, lon: 16.3738, acc: 35 }, locale: "de-AT", currency: "EUR", cc: "AT" },
        IE: { name: "Ireland", tz: "Europe/Dublin", lang: "en-IE", langs: ["en-IE", "en"], ipv4: "86.40.1.1", ipv6: "2a01:260::1", localIP: "192.168.1.126", mDNS: "a7b8c9d0.local", webRTC: ["86.40.1.1", "2a01:260::1"], geo: { lat: 53.3498, lon: -6.2603, acc: 35 }, locale: "en-IE", currency: "EUR", cc: "IE" },
        IL: { name: "Israel", tz: "Asia/Jerusalem", lang: "he-IL", langs: ["he-IL", "he"], ipv4: "109.64.1.1", ipv6: "2a01:6f00::1", localIP: "192.168.1.127", mDNS: "b8c9d0e1.local", webRTC: ["109.64.1.1", "2a01:6f00::1"], geo: { lat: 31.7683, lon: 35.2137, acc: 40 }, locale: "he-IL", currency: "ILS", cc: "IL" },
        SG: { name: "Singapore", tz: "Asia/Singapore", lang: "en-SG", langs: ["en-SG", "en", "zh-SG"], ipv4: "116.15.1.1", ipv6: "2406:1000::1", localIP: "192.168.1.128", mDNS: "c9d0e1f2.local", webRTC: ["116.15.1.1", "2406:1000::1"], geo: { lat: 1.3521, lon: 103.8198, acc: 25 }, locale: "en-SG", currency: "SGD", cc: "SG" },
        TH: { name: "Thailand", tz: "Asia/Bangkok", lang: "th-TH", langs: ["th-TH", "th"], ipv4: "171.97.1.1", ipv6: "2403:6200::1", localIP: "192.168.1.129", mDNS: "d0e1f2g3.local", webRTC: ["171.97.1.1", "2403:6200::1"], geo: { lat: 13.7563, lon: 100.5018, acc: 50 }, locale: "th-TH", currency: "THB", cc: "TH" },
        MY: { name: "Malaysia", tz: "Asia/Kuala_Lumpur", lang: "ms-MY", langs: ["ms-MY", "ms", "en-MY"], ipv4: "113.23.1.1", ipv6: "2402:b100::1", localIP: "192.168.1.130", mDNS: "e1f2g3h4.local", webRTC: ["113.23.1.1", "2402:b100::1"], geo: { lat: 3.139, lon: 101.6869, acc: 50 }, locale: "ms-MY", currency: "MYR", cc: "MY" },
        PH: { name: "Philippines", tz: "Asia/Manila", lang: "en-PH", langs: ["en-PH", "en", "fil-PH"], ipv4: "112.208.1.1", ipv6: "2405:8d00::1", localIP: "192.168.1.131", mDNS: "f2g3h4i5.local", webRTC: ["112.208.1.1", "2405:8d00::1"], geo: { lat: 14.5995, lon: 120.9842, acc: 60 }, locale: "en-PH", currency: "PHP", cc: "PH" },
        VN: { name: "Vietnam", tz: "Asia/Ho_Chi_Minh", lang: "vi-VN", langs: ["vi-VN", "vi"], ipv4: "14.186.1.1", ipv6: "2402:8000::1", localIP: "192.168.1.132", mDNS: "g3h4i5j6.local", webRTC: ["14.186.1.1", "2402:8000::1"], geo: { lat: 10.8231, lon: 106.6297, acc: 70 }, locale: "vi-VN", currency: "VND", cc: "VN" },
        ZA: { name: "South Africa", tz: "Africa/Johannesburg", lang: "en-ZA", langs: ["en-ZA", "en"], ipv4: "41.13.1.1", ipv6: "2c0f:ec00::1", localIP: "192.168.1.133", mDNS: "h4i5j6k7.local", webRTC: ["41.13.1.1", "2c0f:ec00::1"], geo: { lat: -26.2041, lon: 28.0473, acc: 50 }, locale: "en-ZA", currency: "ZAR", cc: "ZA" },
        NG: { name: "Nigeria", tz: "Africa/Lagos", lang: "en-NG", langs: ["en-NG", "en"], ipv4: "105.112.1.1", ipv6: "2c0f:f8f0::1", localIP: "192.168.1.134", mDNS: "i5j6k7l8.local", webRTC: ["105.112.1.1", "2c0f:f8f0::1"], geo: { lat: 6.5244, lon: 3.3792, acc: 100 }, locale: "en-NG", currency: "NGN", cc: "NG" },
        EG: { name: "Egypt", tz: "Africa/Cairo", lang: "ar-EG", langs: ["ar-EG", "ar"], ipv4: "156.195.1.1", ipv6: "2c0f:f8c0::1", localIP: "192.168.1.135", mDNS: "j6k7l8m9.local", webRTC: ["156.195.1.1", "2c0f:f8c0::1"], geo: { lat: 30.0444, lon: 31.2357, acc: 70 }, locale: "ar-EG", currency: "EGP", cc: "EG" },
        AE: { name: "UAE", tz: "Asia/Dubai", lang: "en-AE", langs: ["en-AE", "en", "ar-AE"], ipv4: "94.200.1.1", ipv6: "2a02:f900::1", localIP: "192.168.1.136", mDNS: "k7l8m9n0.local", webRTC: ["94.200.1.1", "2a02:f900::1"], geo: { lat: 25.2048, lon: 55.2708, acc: 40 }, locale: "en-AE", currency: "AED", cc: "AE" },
        DK: { name: "Denmark", tz: "Europe/Copenhagen", lang: "da-DK", langs: ["da-DK", "da"], ipv4: "87.54.1.1", ipv6: "2a01:6e00::1", localIP: "192.168.1.137", mDNS: "l8m9n0o1.local", webRTC: ["87.54.1.1", "2a01:6e00::1"], geo: { lat: 55.6761, lon: 12.5683, acc: 30 }, locale: "da-DK", currency: "DKK", cc: "DK" },
        FI: { name: "Finland", tz: "Europe/Helsinki", lang: "fi-FI", langs: ["fi-FI", "fi"], ipv4: "91.152.1.1", ipv6: "2a00:15a8::1", localIP: "192.168.1.138", mDNS: "m9n0o1p2.local", webRTC: ["91.152.1.1", "2a00:15a8::1"], geo: { lat: 60.1699, lon: 24.9384, acc: 30 }, locale: "fi-FI", currency: "EUR", cc: "FI" },
        PT: { name: "Portugal", tz: "Europe/Lisbon", lang: "pt-PT", langs: ["pt-PT", "pt"], ipv4: "188.80.1.1", ipv6: "2001:690:0:1::1", localIP: "192.168.1.139", mDNS: "n0o1p2q3.local", webRTC: ["188.80.1.1", "2001:690:0:1::1"], geo: { lat: 38.7223, lon: -9.1393, acc: 35 }, locale: "pt-PT", currency: "EUR", cc: "PT" },
        NZ: { name: "New Zealand", tz: "Pacific/Auckland", lang: "en-NZ", langs: ["en-NZ", "en"], ipv4: "122.56.1.1", ipv6: "2404:4400::1", localIP: "192.168.1.140", mDNS: "o1p2q3r4.local", webRTC: ["122.56.1.1", "2404:4400::1"], geo: { lat: -36.8485, lon: 174.7633, acc: 30 }, locale: "en-NZ", currency: "NZD", cc: "NZ" },
        GR: { name: "Greece", tz: "Europe/Athens", lang: "el-GR", langs: ["el-GR", "el"], ipv4: "94.64.1.1", ipv6: "2a02:587::1", localIP: "192.168.1.141", mDNS: "p2q3r4s5.local", webRTC: ["94.64.1.1", "2a02:587::1"], geo: { lat: 37.9838, lon: 23.7275, acc: 40 }, locale: "el-GR", currency: "EUR", cc: "GR" },
        CZ: { name: "Czech Republic", tz: "Europe/Prague", lang: "cs-CZ", langs: ["cs-CZ", "cs"], ipv4: "89.176.1.1", ipv6: "2a00:1028::1", localIP: "192.168.1.142", mDNS: "q3r4s5t6.local", webRTC: ["89.176.1.1", "2a00:1028::1"], geo: { lat: 50.0755, lon: 14.4378, acc: 35 }, locale: "cs-CZ", currency: "CZK", cc: "CZ" },
        RO: { name: "Romania", tz: "Europe/Bucharest", lang: "ro-RO", langs: ["ro-RO", "ro"], ipv4: "86.120.1.1", ipv6: "2a02:2f08::1", localIP: "192.168.1.143", mDNS: "r4s5t6u7.local", webRTC: ["86.120.1.1", "2a02:2f08::1"], geo: { lat: 44.4268, lon: 26.1025, acc: 45 }, locale: "ro-RO", currency: "RON", cc: "RO" },
        CL: { name: "Chile", tz: "America/Santiago", lang: "es-CL", langs: ["es-CL", "es"], ipv4: "190.82.1.1", ipv6: "2800:600::1", localIP: "192.168.1.144", mDNS: "s5t6u7v8.local", webRTC: ["190.82.1.1", "2800:600::1"], geo: { lat: -33.4489, lon: -70.6693, acc: 50 }, locale: "es-CL", currency: "CLP", cc: "CL" },
        PK: { name: "Pakistan", tz: "Asia/Karachi", lang: "en-PK", langs: ["en-PK", "en", "ur-PK"], ipv4: "39.32.1.1", ipv6: "2400:ab00::1", localIP: "192.168.1.145", mDNS: "t6u7v8w9.local", webRTC: ["39.32.1.1", "2400:ab00::1"], geo: { lat: 24.8607, lon: 67.0011, acc: 80 }, locale: "en-PK", currency: "PKR", cc: "PK" },
        BD: { name: "Bangladesh", tz: "Asia/Dhaka", lang: "bn-BD", langs: ["bn-BD", "bn"], ipv4: "103.91.1.1", ipv6: "2401:c000::1", localIP: "192.168.1.146", mDNS: "u7v8w9x0.local", webRTC: ["103.91.1.1", "2401:c000::1"], geo: { lat: 23.8103, lon: 90.4125, acc: 80 }, locale: "bn-BD", currency: "BDT", cc: "BD" },
        IR: { name: "Iran", tz: "Asia/Tehran", lang: "fa-IR", langs: ["fa-IR", "fa"], ipv4: "5.120.24.1", ipv6: "2a01:5ec0:1::1", localIP: "192.168.1.147", mDNS: "v8w9x0y1.local", webRTC: ["5.120.24.1", "2a01:5ec0:1::1"], geo: { lat: 35.6892, lon: 51.389, acc: 60 }, locale: "fa-IR", currency: "IRR", cc: "IR" },
        CO: { name: "Colombia", tz: "America/Bogota", lang: "es-CO", langs: ["es-CO", "es"], ipv4: "181.48.1.1", ipv6: "2800:360::1", localIP: "192.168.1.148", mDNS: "w9x0y1z2.local", webRTC: ["181.48.1.1", "2800:360::1"], geo: { lat: 4.711, lon: -74.0721, acc: 60 }, locale: "es-CO", currency: "COP", cc: "CO" },
        UA: { name: "Ukraine", tz: "Europe/Kiev", lang: "uk-UA", langs: ["uk-UA", "uk"], ipv4: "37.73.1.1", ipv6: "2a01:9500::1", localIP: "192.168.1.149", mDNS: "x0y1z2a3.local", webRTC: ["37.73.1.1", "2a01:9500::1"], geo: { lat: 50.4501, lon: 30.5234, acc: 50 }, locale: "uk-UA", currency: "UAH", cc: "UA" }
    };
    const PROFILES = {
        munitos: {
            ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            platform: "Linux x86_64",
            cores: 8,
            memory: 8,
            touch: 0,
            screen: { w: 1920, h: 1080, aw: 1920, ah: 1040, cd: 24, pd: 24 },
            window: { ow: 1920, oh: 1080, iw: 1920, ih: 1040, sx: 0, sy: 0, dpr: 1 },
            orientation: { type: "landscape-primary", angle: 0 },
            webgl: { vendor: "Google Inc. (Intel)", renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)" },
            conn: { type: "4g", rtt: 50, down: 10, save: false },
            battery: { level: 0.26, charging: true, chargingTime: 1800, dischargingTime: Infinity },
            fonts: ["Arial", "Helvetica", "Times New Roman", "Courier New", "Ubuntu", "Noto Sans", "DejaVu Sans", "Liberation Sans"],
            theme: "dark",
            hdr: false,
            gamut: "srgb",
            pwa: false,
            perms: { geolocation: "denied", notifications: "denied", camera: "denied", microphone: "denied", "persistent-storage": "denied", "background-fetch": "denied" },
            media: { ai: 0, ao: 0, vi: 0 },
            webgpu: false,
            referrer: "",
            plugins: [],
            mimeTypes: [],
            speech: { voices: [] },
            bluetooth: false,
            usb: false,
            storage: { quota: 1073741824, usage: 104857600, persisted: false }
        },
        windows11: {
            ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
            platform: "Win32",
            cores: 16,
            memory: 16,
            touch: 0,
            screen: { w: 2560, h: 1440, aw: 2560, ah: 1400, cd: 24, pd: 24 },
            window: { ow: 2560, oh: 1440, iw: 2560, ih: 1400, sx: 0, sy: 0, dpr: 1 },
            orientation: { type: "landscape-primary", angle: 0 },
            webgl: { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)" },
            conn: { type: "4g", rtt: 30, down: 20, save: false },
            battery: { level: 0.85, charging: true, chargingTime: 1200, dischargingTime: Infinity },
            fonts: ["Segoe UI", "Arial", "Calibri", "Cambria", "Times New Roman", "Verdana", "Tahoma", "Georgia", "Consolas", "Courier New"],
            theme: "light",
            hdr: true,
            gamut: "p3",
            pwa: false,
            perms: { geolocation: "denied", notifications: "denied", camera: "denied", microphone: "denied", "persistent-storage": "denied", "background-fetch": "denied" },
            media: { ai: 2, ao: 2, vi: 1 },
            webgpu: true,
            referrer: "",
            plugins: [],
            mimeTypes: [],
            speech: { voices: ["Microsoft David", "Microsoft Zira"] },
            bluetooth: true,
            usb: true,
            storage: { quota: 107374182400, usage: 2147483648, persisted: true }
        },
        s25: {
            ua: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
            platform: "Linux armv8l",
            cores: 8,
            memory: 8,
            touch: 5,
            screen: { w: 1080, h: 2340, aw: 1080, ah: 2250, cd: 24, pd: 24 },
            window: { ow: 1080, oh: 2340, iw: 1080, ih: 2250, sx: 0, sy: 0, dpr: 2.5 },
            orientation: { type: "portrait-primary", angle: 0 },
            webgl: { vendor: "Qualcomm", renderer: "Adreno (TM) 740" },
            conn: { type: "4g", rtt: 40, down: 15, save: false },
            battery: { level: 0.72, charging: false, chargingTime: Infinity, dischargingTime: 14400 },
            fonts: ["Roboto", "Noto Sans", "Noto Color Emoji", "Droid Sans", "sans-serif"],
            theme: "dark",
            hdr: true,
            gamut: "p3",
            pwa: false,
            perms: { geolocation: "denied", notifications: "denied", camera: "denied", microphone: "denied", "persistent-storage": "denied", "background-fetch": "denied" },
            media: { ai: 2, ao: 1, vi: 2 },
            webgpu: false,
            referrer: "",
            plugins: [],
            mimeTypes: [],
            speech: { voices: ["Google 日本語", "Google UK English Male"] },
            bluetooth: true,
            usb: true,
            storage: { quota: 53687091200, usage: 1073741824, persisted: true }
        }
    };
    const PROFILE_NAMES = Object.freeze({
        munitos: "MUNITOS Linux",
        windows11: "Windows 11",
        s25: "Samsung S25"
    });
    const PROFILE_BADGES = Object.freeze({
        munitos: "MUNITOS",
        windows11: "WIN11",
        s25: "S25"
    });
    const FEATURE_LABELS = Object.freeze({
        webRTCBlock: "Block WebRTC Leaks",
        canvasSpoof: "Canvas Protection",
        audioSpoof: "Audio Protection",
        fontSpoof: "Font Spoofing",
        timezoneSpoof: "Timezone Spoofing",
        permissionsSpoof: "Permissions API Spoof",
        mediaDevicesSpoof: "MediaDevices Spoof",
        webGPUSpoof: "WebGPU Spoof",
        themeSpoof: "Theme Spoof",
        hdrSpoof: "HDR Detection Spoof",
        colorGamutSpoof: "Color Gamut Spoof",
        pwaSpoof: "PWA Mode Spoof",
        referrerSpoof: "Referrer Spoof",
        touchSpoof: "Touch Events Spoof",
        webdriverBlock: "Webdriver Block",
        privateMode: "Private Mode Evasion",
        batterySpoof: "Battery Spoof",
        geoSpoof: "Geolocation Spoof",
        workerSpoof: "Worker Spoof",
        orientationSpoof: "Orientation Spoof",
        speechSpoof: "Speech Synthesis Spoof",
        bluetoothSpoof: "Bluetooth Block",
        usbSpoof: "USB Block",
        storageSpoof: "Storage Quota Spoof"
    });
    const SVG_PATHS = Object.freeze({
        back: '<circle cx="12" cy="12" r="10"/><path d="M13.5 8L9.5 12l4 4" stroke-linecap="round" stroke-linejoin="round"/>',
        run: '<path d="M12 2L2 19h20L12 2z" stroke="#fff" stroke-width="1.4" fill="none" stroke-linejoin="round"/><circle cx="12" cy="15" r="1.3" fill="#fff"/><path d="M12 10v-2" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>',
        recovery: '<path d="M4 4h16v12H4V4z" stroke="#fff" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M8 20h8M12 16v4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="10" r="3" fill="#fff" opacity=".9"/>',
        spoof: '<path d="M12 2v20M2 12h20" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>',
        country: '<circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="1.3" fill="none"/><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9z" stroke="#fff" stroke-width="1.1" fill="none"/>',
        feature: '<path d="M4 6h10M4 12h16M4 18h10" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><circle cx="17" cy="6" r="2.5" fill="#fff"/><circle cx="20" cy="12" r="2.5" fill="#fff"/><circle cx="17" cy="18" r="2.5" fill="#fff"/>',
        profile: '<path d="M12 3l7 4v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V7l7-4z" stroke="#fff" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
        reset: '<path d="M4 4l16 16M20 4L4 20" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="12" r="8" stroke="#fff" stroke-width="1.2" fill="none"/>',
        reinstall: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>',
        munitos: '<path d="M12 2L4 6v6c0 5 4 9 8 11 4-2 8-6 8-11V6l-8-4z" stroke="#fff" stroke-width="1.3" fill="none" stroke-linejoin="round"/>',
        windows: '<rect x="3" y="3" width="18" height="18" rx="1" stroke="#fff" stroke-width="1.3" fill="none"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke="#fff" stroke-width=".8" fill="none"/>',
        phone: '<rect x="4" y="1" width="16" height="22" rx="2" stroke="#fff" stroke-width="1.3" fill="none"/><path d="M9 1.5h6" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/><rect x="6" y="5" width="12" height="14" rx="1" stroke="#fff" stroke-width=".8" fill="none" opacity=".6"/>',
        proxy: '<circle cx="8" cy="8" r="3" stroke="#fff" stroke-width="1.3" fill="none"/><circle cx="16" cy="16" r="3" stroke="#fff" stroke-width="1.3" fill="none"/><path d="M10.5 10.5l3 3M13.5 8h3M8 16H5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>'
    });
    const CSS = `
#munitos-recovery-runtime{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:2147483646;isolation:isolate;overflow:hidden;background:#000;color:#fff;font-family:"Segoe UI",Tahoma,Arial,sans-serif;font-size:16px;line-height:1.4;text-align:left;contain:layout style paint;overscroll-behavior:none}
#munitos-recovery-runtime,#munitos-recovery-runtime button,#munitos-recovery-runtime a,#munitos-recovery-runtime div,#munitos-recovery-runtime span,#munitos-recovery-runtime p,#munitos-recovery-runtime h1,#munitos-recovery-runtime h2,#munitos-recovery-runtime h3,#munitos-recovery-runtime svg{box-sizing:border-box}
#munitos-recovery-runtime .lk-bg-wrap{position:fixed;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;user-select:none;z-index:0;display:grid;place-items:center;background:#000}
#munitos-recovery-runtime .lk-bg{position:absolute;top:50%;left:50%;right:auto;width:min(1320px,96vw);aspect-ratio:27/22;height:auto;transform:translate(-50%,-50%);z-index:0;pointer-events:none;user-select:none;opacity:.25;background-repeat:no-repeat;background-position:center;background-size:contain;filter:saturate(.72) contrast(1.04)}
#munitos-recovery-runtime .lk-bg-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 22%,rgba(0,0,0,.025) 52%,rgba(0,0,0,.14) 100%),linear-gradient(90deg,rgba(255,255,255,.05) 0%,rgba(255,255,255,0) 50%,rgba(255,255,255,.08) 100%)}
#munitos-recovery-runtime .lk-app{position:relative;z-index:2;width:100%;height:100%;min-height:100vh;min-height:100dvh;max-width:1400px;margin:0 auto;padding:clamp(24px,4vw,60px) clamp(24px,6vw,90px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:left;overflow:hidden}
#munitos-recovery-runtime .lk-screen{display:none;width:min(100%,940px);margin:0 auto;animation:lk-fadeIn .2s ease;backface-visibility:hidden}
#munitos-recovery-runtime .lk-screen.active{display:block}
@keyframes lk-fadeIn{from{opacity:0}to{opacity:1}}
#munitos-recovery-runtime .lk-header{display:flex;align-items:center;gap:clamp(14px,1.6vw,24px);margin-bottom:clamp(28px,4vw,46px)}
#munitos-recovery-runtime .lk-back-btn{display:none;width:clamp(34px,2.6vw,40px);height:clamp(34px,2.6vw,40px);border:0;border-radius:0;background:transparent;color:#fff;cursor:pointer;padding:0;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s ease,transform .15s ease;appearance:none}
#munitos-recovery-runtime .lk-back-btn.show{display:flex}
#munitos-recovery-runtime .lk-back-btn:hover{opacity:.75}
#munitos-recovery-runtime .lk-back-btn:active{transform:translateX(-1px)}
#munitos-recovery-runtime .lk-back-btn:focus-visible{outline:1px solid rgba(255,255,255,.8);outline-offset:3px}
#munitos-recovery-runtime .lk-back-btn svg{width:100%;height:100%;pointer-events:none;display:block;stroke:currentColor;fill:none}
#munitos-recovery-runtime .lk-title{font-size:clamp(22px,2.6vw,36px);font-weight:400;line-height:1.2;color:#fff;margin:0}
#munitos-recovery-runtime .lk-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,420px));column-gap:clamp(24px,4vw,60px);row-gap:clamp(10px,1.6vw,20px);width:100%;max-width:940px;margin:0 auto}
#munitos-recovery-runtime .lk-tile{display:flex;align-items:flex-start;gap:clamp(10px,1.4vw,16px);padding:8px;cursor:pointer;border:2px solid transparent;background:transparent;color:#fff;text-align:left;width:100%;font:inherit;appearance:none}
#munitos-recovery-runtime .lk-tile:hover,#munitos-recovery-runtime .lk-tile:focus-visible{border-color:#fff;outline:none}
#munitos-recovery-runtime .lk-tile:active{background:rgba(255,255,255,.08)}
#munitos-recovery-runtime .lk-icon-box{width:clamp(56px,6vw,82px);height:clamp(56px,6vw,82px);background:rgba(255,255,255,.07);flex-shrink:0;display:flex;align-items:center;justify-content:center}
#munitos-recovery-runtime .lk-icon-box svg{width:48%;height:48%;fill:#fff;stroke:#fff;display:block}
#munitos-recovery-runtime .munitos-tile-text{min-width:0}
#munitos-recovery-runtime .munitos-tile-text h3{margin:0 0 4px;font-size:clamp(15px,1.4vw,19px);font-weight:400;line-height:1.25;color:#fff}
#munitos-recovery-runtime .munitos-tile-text p{margin:0;font-size:clamp(11.5px,1vw,13px);line-height:1.4;color:#d8ecfb;max-width:260px}
#munitos-recovery-runtime .lk-more-link,#munitos-recovery-runtime .lk-action-link{font-family:inherit;appearance:none}
#munitos-recovery-runtime .lk-more-link{margin-top:clamp(24px,4vw,42px);font-size:clamp(13px,1.2vw,15px);color:#fff;text-decoration:underline;cursor:pointer;width:fit-content;background:none;border:0;padding:0;display:inline-block}
#munitos-recovery-runtime .lk-more-link:hover{color:#d8ecfb}
#munitos-recovery-runtime .lk-more-link:focus-visible,#munitos-recovery-runtime .lk-action-link:focus-visible{outline:1px solid rgba(255,255,255,.85);outline-offset:4px}
#munitos-recovery-runtime .lk-sub-content{max-width:700px;font-size:clamp(13px,1.2vw,15px);line-height:1.8;color:#fff}
#munitos-recovery-runtime .lk-sub-content p{margin:0 0 16px;color:#fff}
#munitos-recovery-runtime .lk-action-link{display:block;margin-top:20px;text-decoration:underline;cursor:pointer;width:fit-content;color:#fff;background:transparent;border:0;padding:0;font-size:inherit;line-height:inherit;text-align:left}
#munitos-recovery-runtime .lk-action-link:hover{color:#d8ecfb}
#munitos-recovery-runtime .lk-action-link:disabled{opacity:.55;cursor:default}
#munitos-recovery-runtime .munitos-status-badge{display:inline-block;font-size:clamp(9px,.8vw,11px);padding:2px 6px;border-radius:2px;margin-left:8px;vertical-align:middle;letter-spacing:.3px}
#munitos-recovery-runtime .munitos-status-badge.on{background:rgba(0,200,0,.18);color:#0f0}
#munitos-recovery-runtime .munitos-status-badge.off{background:rgba(255,0,0,.16);color:#f55}
#munitos-recovery-runtime .munitos-status-badge.current{background:rgba(0,120,255,.16);color:#5cf}
#munitos-recovery-runtime .munitos-status-badge.ready{background:rgba(0,255,180,.16);color:#5f5}
#munitos-recovery-runtime .munitos-country-grid,#munitos-recovery-runtime .munitos-feature-grid{display:grid;width:100%;max-width:900px;margin:0 auto;max-height:55vh;overflow-y:auto;padding:4px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
#munitos-recovery-runtime .munitos-country-grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:clamp(8px,1vw,14px)}
#munitos-recovery-runtime .munitos-feature-grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:clamp(8px,1vw,12px)}
#munitos-recovery-runtime .munitos-country-grid::-webkit-scrollbar,#munitos-recovery-runtime .munitos-feature-grid::-webkit-scrollbar{width:6px}
#munitos-recovery-runtime .munitos-country-grid::-webkit-scrollbar-track,#munitos-recovery-runtime .munitos-feature-grid::-webkit-scrollbar-track{background:transparent}
#munitos-recovery-runtime .munitos-country-grid::-webkit-scrollbar-thumb,#munitos-recovery-runtime .munitos-feature-grid::-webkit-scrollbar-thumb{background:rgba(255,255,255,.25);border-radius:2px}
#munitos-recovery-runtime .munitos-country-item,#munitos-recovery-runtime .munitos-feature-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;font-size:clamp(11px,.9vw,13px);cursor:pointer;border:2px solid transparent;background:transparent;color:#fff;text-align:left;user-select:none;width:100%;font-family:inherit;appearance:none;transition:border-color .1s ease,background-color .1s ease}
#munitos-recovery-runtime .munitos-country-item:hover,#munitos-recovery-runtime .munitos-feature-item:hover,#munitos-recovery-runtime .munitos-country-item:focus-visible,#munitos-recovery-runtime .munitos-feature-item:focus-visible{border-color:#fff;outline:none}
#munitos-recovery-runtime .munitos-country-item.selected,#munitos-recovery-runtime .munitos-feature-item.selected{border-color:#b0b0b0;background:rgba(255,255,255,.08)}
#munitos-recovery-runtime .munitos-country-item span:first-child,#munitos-recovery-runtime .munitos-feature-item span:first-child{min-width:0}
#munitos-recovery-runtime .munitos-modal-layer{position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.62);backdrop-filter:blur(2px);animation:lk-modalFadeIn .2s ease}
#munitos-recovery-runtime .lk-modal{width:min(100%,560px);background:rgba(13,13,13,.96);border:1px solid rgba(255,255,255,.2);box-shadow:0 22px 90px rgba(0,0,0,.5);padding:28px;animation:lk-modalIn .22s ease;transform-origin:center}
#munitos-recovery-runtime .lk-modal h2{margin:0 0 14px;font-size:clamp(19px,2vw,26px);font-weight:400;line-height:1.25;color:#fff}
#munitos-recovery-runtime .lk-modal p{margin:0;color:#d8ecfb;font-size:clamp(13px,1.15vw,15px);line-height:1.7}
#munitos-recovery-runtime .munitos-modal-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:26px}
#munitos-recovery-runtime .munitos-modal-btn{border:1px solid rgba(255,255,255,.36);background:rgba(255,255,255,.04);color:#fff;padding:10px 16px;font:inherit;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,opacity .15s ease,transform .15s ease}
#munitos-recovery-runtime .munitos-modal-btn:hover{background:rgba(255,255,255,.11);border-color:#fff}
#munitos-recovery-runtime .munitos-modal-btn:active{transform:translateY(1px)}
#munitos-recovery-runtime .munitos-modal-btn:focus-visible{outline:1px solid #fff;outline-offset:3px}
#munitos-recovery-runtime .munitos-modal-btn.primary{background:#fff;color:#000;border-color:#fff}
#munitos-recovery-runtime .munitos-modal-btn.primary:hover{background:#ececec}
#munitos-recovery-runtime .munitos-modal-btn:disabled{opacity:.45;cursor:default;transform:none}
@keyframes lk-modalFadeIn{from{opacity:0}to{opacity:1}}
@keyframes lk-modalIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
@media (max-width:620px){#munitos-recovery-runtime .lk-grid{grid-template-columns:1fr;max-width:380px}}
@media (max-width:700px){#munitos-recovery-runtime .lk-bg{width:175vw;max-width:none;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.19}#munitos-recovery-runtime .lk-app{padding:24px clamp(16px,5vw,28px)}#munitos-recovery-runtime .munitos-country-grid,#munitos-recovery-runtime .munitos-feature-grid{max-height:50vh;grid-template-columns:1fr}}
@media (max-width:480px){#munitos-recovery-runtime .lk-bg{width:205vw;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.16}#munitos-recovery-runtime .lk-app{padding:20px 14px}#munitos-recovery-runtime .lk-modal{padding:22px}.munitos-modal-actions{flex-direction:column-reverse}.munitos-modal-btn{width:100%}}
@media (max-height:650px){#munitos-recovery-runtime .lk-app{justify-content:center}.lk-header{margin-bottom:24px}#munitos-recovery-runtime .lk-more-link{margin-top:24px}#munitos-recovery-runtime .munitos-country-grid,#munitos-recovery-runtime .munitos-feature-grid{max-height:45vh}}
#munitos-recovery-runtime .munitos-proxy-management{display:flex;flex-direction:column;gap:14px;max-width:920px}
#munitos-recovery-runtime .munitos-proxy-form{display:grid;grid-template-columns:minmax(130px,.55fr) minmax(280px,1.45fr) auto;gap:10px;width:100%}
#munitos-recovery-runtime .munitos-proxy-input{width:100%;min-width:0;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.04);color:#fff;padding:11px 12px;font:inherit;outline:none}
#munitos-recovery-runtime .munitos-proxy-input::placeholder{color:rgba(255,255,255,.48)}
#munitos-recovery-runtime .munitos-proxy-input:focus{border-color:#fff}
#munitos-recovery-runtime .munitos-proxy-action{border:1px solid rgba(255,255,255,.36);background:rgba(255,255,255,.06);color:#fff;padding:9px 13px;font:inherit;cursor:pointer;white-space:nowrap}
#munitos-recovery-runtime .munitos-proxy-action:hover{background:rgba(255,255,255,.13);border-color:#fff}
#munitos-recovery-runtime .munitos-proxy-action:disabled{opacity:.45;cursor:default}
#munitos-recovery-runtime .munitos-proxy-note{margin:0;color:#d8ecfb;font-size:clamp(12px,1vw,14px);line-height:1.65}
#munitos-recovery-runtime .munitos-proxy-status{min-height:20px;color:#d8ecfb;font-size:13px}
#munitos-recovery-runtime .munitos-proxy-status.error{color:#ff8b8b}
#munitos-recovery-runtime .munitos-proxy-status.success{color:#86ff9d}
#munitos-recovery-runtime .munitos-proxy-summary{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:#b7c2ce}
#munitos-recovery-runtime .munitos-proxy-summary span{border:1px solid rgba(255,255,255,.13);padding:5px 8px;background:rgba(255,255,255,.025)}
#munitos-recovery-runtime .munitos-proxy-list{display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow:auto;padding-right:4px}
#munitos-recovery-runtime .munitos-proxy-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;border:1px solid rgba(255,255,255,.14);padding:10px 12px;background:rgba(255,255,255,.025)}
#munitos-recovery-runtime .munitos-proxy-item-main{min-width:0;display:flex;flex-direction:column;gap:4px}
#munitos-recovery-runtime .munitos-proxy-item-top{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
#munitos-recovery-runtime .munitos-proxy-name{font-size:13px;color:#fff}
#munitos-recovery-runtime .munitos-proxy-template{font-size:11px;color:#aebdcc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
#munitos-recovery-runtime .munitos-proxy-meta{font-size:11px;color:#8997a5;line-height:1.5}
#munitos-recovery-runtime .munitos-proxy-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
#munitos-recovery-runtime .munitos-proxy-tag,#munitos-recovery-runtime .munitos-proxy-state{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.2);padding:3px 7px;font-size:10px;letter-spacing:.04em}
#munitos-recovery-runtime .munitos-proxy-tag.system{color:#c9d7e5}
#munitos-recovery-runtime .munitos-proxy-tag.user{color:#fff}
#munitos-recovery-runtime .munitos-proxy-state.online{color:#86ff9d}
#munitos-recovery-runtime .munitos-proxy-state.testing{color:#d8ecfb}
#munitos-recovery-runtime .munitos-proxy-state.failed{color:#ff8b8b}
#munitos-recovery-runtime .munitos-proxy-state.disabled{color:#8f99a5}
#munitos-recovery-runtime .munitos-proxy-state.idle{color:#bfc7d0}
#munitos-recovery-runtime .munitos-custom-empty{color:#9aa6b2;font-size:13px;padding:6px 0}
@media (max-width:760px){#munitos-recovery-runtime .munitos-proxy-form{grid-template-columns:1fr}.munitos-proxy-action{width:100%}#munitos-recovery-runtime .munitos-proxy-item{grid-template-columns:1fr}#munitos-recovery-runtime .munitos-proxy-actions{justify-content:flex-start}}
@media (prefers-reduced-motion:reduce){#munitos-recovery-runtime .lk-screen,#munitos-recovery-runtime .munitos-modal-layer,#munitos-recovery-runtime .lk-modal{animation:none!important;transition:none!important}#munitos-recovery-runtime .lk-back-btn,#munitos-recovery-runtime .lk-tile,#munitos-recovery-runtime .munitos-country-item,#munitos-recovery-runtime .munitos-feature-item,#munitos-recovery-runtime .munitos-modal-btn{transition:none!important}}
`;
    const state = {
        config: null,
        revision: 0,
        lifecycle: STATES.IDLE,
        route: "main",
        root: null,
        style: null,
        app: null,
        screens: new Map(),
        modal: null,
        cleanupFns: new Set(),
        timers: new Set(),
        frames: new Set(),
        observers: new Set(),
        listeners: new Set(),
        overrides: new Map(),
        applied: false,
        currentProfile: null,
        currentCountry: null,
        launchLock: false,
        destroyed: false
    };
    function deepClone(value) {
        if (value === null || typeof value !== "object") return value;
        if (Array.isArray(value)) return value.map(deepClone);
        const output = {};
        Object.keys(value).forEach(function (key) {
            output[key] = deepClone(value[key]);
        });
        return output;
    }
    function deepMerge(target, source) {
        const result = deepClone(target);
        if (!source || typeof source !== "object") return result;
        Object.keys(source).forEach(function (key) {
            const sourceValue = source[key];
            const resultValue = result[key];
            if (sourceValue && typeof sourceValue === "object" && !Array.isArray(sourceValue) && resultValue && typeof resultValue === "object" && !Array.isArray(resultValue)) {
                result[key] = deepMerge(resultValue, sourceValue);
            } else {
                result[key] = deepClone(sourceValue);
            }
        });
        return result;
    }
    function safeStorageGet(storage, key, fallback) {
        try {
            const value = storage.getItem(key);
            return value === null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }
    function safeStorageSet(storage, key, value) {
        try {
            storage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }
    function safeStorageRemove(storage, key) {
        try {
            storage.removeItem(key);
        } catch (e) {}
    }
    function loadConfig() {
        const raw = safeStorageGet(localStorage, STORE.CONFIG, null);
        if (!raw) return deepClone(DEFAULT_CONFIG);
        try {
            const parsed = JSON.parse(raw);
            const merged = deepMerge(DEFAULT_CONFIG, parsed);
            if (!PROFILES[merged.profile]) merged.profile = DEFAULT_CONFIG.profile;
            if (!COUNTRIES[merged.country]) merged.country = DEFAULT_CONFIG.country;
            const validFeatures = Object.keys(DEFAULT_CONFIG.features);
            const cleanFeatures = {};
            validFeatures.forEach(function (key) {
                cleanFeatures[key] = Boolean(merged.features && Object.prototype.hasOwnProperty.call(merged.features, key) ? merged.features[key] : DEFAULT_CONFIG.features[key]);
            });
            merged.features = cleanFeatures;
            merged.enabled = Boolean(merged.enabled);
            return merged;
        } catch (e) {
            return deepClone(DEFAULT_CONFIG);
        }
    }
    function saveConfig() {
        safeStorageSet(localStorage, STORE.CONFIG, JSON.stringify(state.config));
    }
    function loadRevision() {
        const raw = safeStorageGet(localStorage, STORE.REVISION, "0");
        const revision = Number.parseInt(raw, 10);
        return Number.isFinite(revision) && revision >= 0 ? revision : 0;
    }
    function saveRevision() {
        safeStorageSet(localStorage, STORE.REVISION, String(state.revision));
    }
    function loadRestartMarker() {
        const raw = safeStorageGet(sessionStorage, STORE.RESTART, null);
        if (!raw) return null;
        try {
            const marker = JSON.parse(raw);
            if (!marker || !Number.isFinite(Number(marker.revision))) return null;
            return {
                revision: Number(marker.revision),
                requestedAt: Number.isFinite(Number(marker.requestedAt)) ? Number(marker.requestedAt) : 0
            };
        } catch (e) {
            return null;
        }
    }
    function saveRestartMarker() {
        safeStorageSet(sessionStorage, STORE.RESTART, JSON.stringify({
            revision: state.revision,
            requestedAt: Date.now()
        }));
    }
    function clearRestartMarker() {
        safeStorageRemove(sessionStorage, STORE.RESTART);
    }
    function loadSeed() {
        const saved = safeStorageGet(sessionStorage, STORE.SEED, null);
        const parsed = Number.parseInt(saved, 10);
        if (Number.isFinite(parsed)) return parsed;
        const seed = Math.floor(Math.random() * 0xFFFFFFFF);
        safeStorageSet(sessionStorage, STORE.SEED, String(seed));
        return seed;
    }
    function hasPendingRestart() {
        return state.lifecycle === STATES.CONFIG_CHANGED || state.lifecycle === STATES.RESTART_REQUIRED || state.lifecycle === STATES.RESTART_REQUESTED;
    }
    function snapshotConfig() {
        return JSON.stringify(state.config);
    }
    function createRevision() {
        state.revision += 1;
        saveRevision();
        state.lifecycle = STATES.RESTART_REQUIRED;
        clearRestartMarker();
    }
    function safeDefine(target, property, descriptor, key) {
        if (!target) return;
        const overrideKey = key || String(property);
        if (!state.overrides.has(overrideKey)) {
            let owner = target;
            let original;
            try {
                let cursor = target;
                while (cursor) {
                    const candidate = Object.getOwnPropertyDescriptor(cursor, property);
                    if (candidate) {
                        owner = cursor;
                        original = candidate;
                        break;
                    }
                    cursor = Object.getPrototypeOf(cursor);
                }
            } catch (e) {}
            if (original) {
                state.overrides.set(overrideKey, {
                    target: owner,
                    property: property,
                    descriptor: original
                });
            } else {
                state.overrides.set(overrideKey, {
                    target: target,
                    property: property,
                    descriptor: {
                        value: undefined,
                        configurable: true,
                        enumerable: true,
                        writable: true
                    }
                });
            }
        }
        try {
            const finalDescriptor = {
                configurable: descriptor && descriptor.configurable !== undefined ? descriptor.configurable : true,
                enumerable: descriptor && descriptor.enumerable !== undefined ? descriptor.enumerable : true
            };
            if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")) finalDescriptor.value = descriptor.value;
            if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "writable")) finalDescriptor.writable = descriptor.writable;
            if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "get")) finalDescriptor.get = descriptor.get;
            if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "set")) finalDescriptor.set = descriptor.set;
            Object.defineProperty(target, property, finalDescriptor);
        } catch (e) {}
    }
    function restoreAll() {
        state.overrides.forEach(function (record) {
            if (!record || !record.target || !record.property || !record.descriptor) return;
            try {
                Object.defineProperty(record.target, record.property, record.descriptor);
            } catch (e) {}
        });
        state.overrides.clear();
        state.applied = false;
        state.currentProfile = null;
        state.currentCountry = null;
    }
    function nativeToString() {
        return "function " + (this.name || "") + "() { [native code] }";
    }
    function maskNative(fn, name) {
        const wrapped = function () {
            return fn.apply(this, arguments);
        };
        try {
            Object.defineProperty(wrapped, "toString", {
                value: nativeToString,
                configurable: true
            });
        } catch (e) {
            wrapped.toString = nativeToString;
        }
        if (name) {
            try {
                Object.defineProperty(wrapped, "name", {
                    value: name,
                    configurable: true
                });
            } catch (e) {}
        }
        return wrapped;
    }
    function pixelHash(x, y, channel, seed) {
        let h = seed ^ (x * 374761393) ^ (y * 668265263) ^ (channel * 1013904223);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
        h ^= h >>> 16;
        return (h >>> 0) % 7 - 3;
    }
    function getTimezoneOffsetForTZ(tz, date) {
        try {
            const d = date || new Date();
            const fmt = new Intl.DateTimeFormat("en-US", {
                timeZone: tz,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            });
            const parts = fmt.formatToParts(d);
            const get = function (type) {
                const item = parts.find(function (p) {
                    return p.type === type;
                });
                return item ? Number.parseInt(item.value, 10) : 0;
            };
            const inTZ = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") === 24 ? 0 : get("hour"), get("minute"), get("second"));
            const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
            return (utc - inTZ) / 60000;
        } catch (e) {
            return new Date().getTimezoneOffset();
        }
    }
    function applySpoofing(profileName) {
        restoreAll();
        const profile = PROFILES[profileName] || PROFILES.munitos;
        const country = COUNTRIES[state.config.country] || COUNTRIES.US;
        const f = state.config.features;
        const seed = loadSeed();
        state.applied = true;
        state.currentProfile = profile;
        state.currentCountry = country;
        const d = {
            ...profile,
            lang: country.lang,
            langs: country.langs,
            tz: country.tz,
            ipv4: country.ipv4,
            ipv6: country.ipv6,
            localIP: country.localIP,
            mDNS: country.mDNS,
            webRTC: country.webRTC,
            geo: country.geo,
            locale: country.locale,
            currency: country.currency,
            cc: country.cc
        };
        if (typeof Navigator !== "undefined" && Navigator.prototype) {
            safeDefine(Navigator.prototype, "userAgent", { get: function () { return d.ua; } }, "Navigator.userAgent");
            safeDefine(Navigator.prototype, "appVersion", { get: function () { return d.ua.replace("Mozilla/", ""); } }, "Navigator.appVersion");
            safeDefine(Navigator.prototype, "platform", { get: function () { return d.platform; } }, "Navigator.platform");
            safeDefine(Navigator.prototype, "language", { get: function () { return d.lang; } }, "Navigator.language");
            safeDefine(Navigator.prototype, "languages", { get: function () { return Object.freeze(d.langs.slice()); } }, "Navigator.languages");
            safeDefine(Navigator.prototype, "hardwareConcurrency", { get: function () { return d.cores; } }, "Navigator.hardwareConcurrency");
            safeDefine(Navigator.prototype, "deviceMemory", { get: function () { return d.memory; } }, "Navigator.deviceMemory");
            safeDefine(Navigator.prototype, "maxTouchPoints", { get: function () { return d.touch; } }, "Navigator.maxTouchPoints");
            safeDefine(Navigator.prototype, "vendor", { get: function () { return "Google Inc."; } }, "Navigator.vendor");
            safeDefine(Navigator.prototype, "vendorSub", { get: function () { return ""; } }, "Navigator.vendorSub");
            safeDefine(Navigator.prototype, "productSub", { get: function () { return "20030107"; } }, "Navigator.productSub");
            safeDefine(Navigator.prototype, "product", { get: function () { return "Gecko"; } }, "Navigator.product");
            safeDefine(Navigator.prototype, "appCodeName", { get: function () { return "Mozilla"; } }, "Navigator.appCodeName");
            safeDefine(Navigator.prototype, "appName", { get: function () { return "Netscape"; } }, "Navigator.appName");
            safeDefine(Navigator.prototype, "pdfViewerEnabled", { get: function () { return true; } }, "Navigator.pdfViewerEnabled");
            safeDefine(Navigator.prototype, "onLine", { get: function () { return true; } }, "Navigator.onLine");
            safeDefine(Navigator.prototype, "cookieEnabled", { get: function () { return true; } }, "Navigator.cookieEnabled");
            safeDefine(Navigator.prototype, "doNotTrack", { get: function () { return null; } }, "Navigator.doNotTrack");
            try {
                const PluginArrayProto = window.PluginArray ? window.PluginArray.prototype : Object.prototype;
                const MimeTypeArrayProto = window.MimeTypeArray ? window.MimeTypeArray.prototype : Object.prototype;
                const emptyPlugins = Object.create(PluginArrayProto);
                Object.defineProperty(emptyPlugins, "length", { get: function () { return 0; }, enumerable: true });
                emptyPlugins.item = function () { return null; };
                emptyPlugins.namedItem = function () { return null; };
                emptyPlugins.refresh = function () {};
                emptyPlugins[Symbol.iterator] = function* () {};
                const emptyMimeTypes = Object.create(MimeTypeArrayProto);
                Object.defineProperty(emptyMimeTypes, "length", { get: function () { return 0; }, enumerable: true });
                emptyMimeTypes.item = function () { return null; };
                emptyMimeTypes.namedItem = function () { return null; };
                emptyMimeTypes[Symbol.iterator] = function* () {};
                safeDefine(Navigator.prototype, "plugins", { get: function () { return emptyPlugins; } }, "Navigator.plugins");
                safeDefine(Navigator.prototype, "mimeTypes", { get: function () { return emptyMimeTypes; } }, "Navigator.mimeTypes");
            } catch (e) {}
            if (f.webdriverBlock) {
                safeDefine(Navigator.prototype, "webdriver", { get: function () { return false; } }, "Navigator.webdriver");
                try {
                    [
                        "cdc_adoQpoasnfa76pfcZLmcfl_Array",
                        "cdc_adoQpoasnfa76pfcZLmcfl_Promise",
                        "cdc_adoQpoasnfa76pfcZLmcfl_Symbol",
                        "_phantom",
                        "__nightmare",
                        "callPhantom",
                        "__selenium_unwrapped",
                        "__webdriver_evaluate",
                        "__driver_evaluate",
                        "__webdriver_unwrapped",
                        "__driver_unwrapped",
                        "_Selenium_IDE_Recorder",
                        "__fxdriver_evaluate",
                        "__fxdriver_unwrapped",
                        "webdriver"
                    ].forEach(function (key) {
                        try {
                            if (key in window) delete window[key];
                        } catch (e) {}
                    });
                } catch (e) {}
                try {
                    if (window.chrome && !window.chrome.runtime) {
                        const runtime = Object.create(null);
                        runtime.connect = maskNative(function () {}, "connect");
                        runtime.sendMessage = maskNative(function () {}, "sendMessage");
                        runtime.onConnect = {
                            addListener: maskNative(function () {}, "addListener"),
                            removeListener: maskNative(function () {}, "removeListener")
                        };
                        runtime.onMessage = {
                            addListener: maskNative(function () {}, "addListener"),
                            removeListener: maskNative(function () {}, "removeListener")
                        };
                        Object.defineProperty(window.chrome, "runtime", {
                            value: runtime,
                            configurable: true,
                            enumerable: true
                        });
                    }
                } catch (e) {}
            }
        }
        try {
            if (navigator.connection) {
                safeDefine(navigator.connection, "effectiveType", { get: function () { return d.conn.type; } }, "NetInfo.effectiveType");
                safeDefine(navigator.connection, "rtt", { get: function () { return d.conn.rtt; } }, "NetInfo.rtt");
                safeDefine(navigator.connection, "downlink", { get: function () { return d.conn.down; } }, "NetInfo.downlink");
                safeDefine(navigator.connection, "saveData", { get: function () { return d.conn.save; } }, "NetInfo.saveData");
            }
        } catch (e) {}
        if (typeof Screen !== "undefined" && Screen.prototype) {
            safeDefine(Screen.prototype, "width", { get: function () { return d.screen.w; } }, "Screen.width");
            safeDefine(Screen.prototype, "height", { get: function () { return d.screen.h; } }, "Screen.height");
            safeDefine(Screen.prototype, "availWidth", { get: function () { return d.screen.aw; } }, "Screen.availWidth");
            safeDefine(Screen.prototype, "availHeight", { get: function () { return d.screen.ah; } }, "Screen.availHeight");
            safeDefine(Screen.prototype, "colorDepth", { get: function () { return d.screen.cd; } }, "Screen.colorDepth");
            safeDefine(Screen.prototype, "pixelDepth", { get: function () { return d.screen.pd; } }, "Screen.pixelDepth");
            try {
                safeDefine(Screen.prototype, "orientation", {
                    get: function () {
                        return {
                            type: d.orientation.type,
                            angle: d.orientation.angle,
                            onchange: null,
                            addEventListener: maskNative(function () {}, "addEventListener"),
                            removeEventListener: maskNative(function () {}, "removeEventListener"),
                            lock: maskNative(function () { return Promise.resolve(); }, "lock"),
                            unlock: maskNative(function () {}, "unlock")
                        };
                    }
                }, "Screen.orientation");
            } catch (e) {}
        }
        try {
            safeDefine(window, "outerWidth", { get: function () { return d.window.ow; } }, "Window.outerWidth");
            safeDefine(window, "outerHeight", { get: function () { return d.window.oh; } }, "Window.outerHeight");
            safeDefine(window, "innerWidth", { get: function () { return d.window.iw; } }, "Window.innerWidth");
            safeDefine(window, "innerHeight", { get: function () { return d.window.ih; } }, "Window.innerHeight");
            safeDefine(window, "screenX", { get: function () { return d.window.sx; } }, "Window.screenX");
            safeDefine(window, "screenY", { get: function () { return d.window.sy; } }, "Window.screenY");
            safeDefine(window, "devicePixelRatio", { get: function () { return d.window.dpr; } }, "Window.devicePixelRatio");
        } catch (e) {}
        if (f.timezoneSpoof) {
            try {
                safeDefine(Date.prototype, "getTimezoneOffset", {
                    value: maskNative(function () {
                        return getTimezoneOffsetForTZ(d.tz, this);
                    }, "getTimezoneOffset"),
                    writable: true
                }, "Date.getTimezoneOffset");
            } catch (e) {}
            try {
                if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
                    const OrigDTF = Intl.DateTimeFormat;
                    const SpoofedDTF = function (locales, options) {
                        const opts = { ...(options || {}), timeZone: d.tz };
                        return new OrigDTF(locales || d.locale, opts);
                    };
                    SpoofedDTF.prototype = OrigDTF.prototype;
                    SpoofedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf;
                    safeDefine(Intl, "DateTimeFormat", { value: SpoofedDTF }, "Intl.DateTimeFormat");
                }
            } catch (e) {}
            try {
                if (typeof Intl !== "undefined" && Intl.NumberFormat) {
                    const OrigNF = Intl.NumberFormat;
                    const SpoofedNF = function (locales, options) {
                        return new OrigNF(locales || d.locale, options);
                    };
                    SpoofedNF.prototype = OrigNF.prototype;
                    SpoofedNF.supportedLocalesOf = OrigNF.supportedLocalesOf;
                    safeDefine(Intl, "NumberFormat", { value: SpoofedNF }, "Intl.NumberFormat");
                }
            } catch (e) {}
        }
        try {
            if (typeof WebGLRenderingContext !== "undefined" && WebGLRenderingContext.prototype) {
                const origGetParam = WebGLRenderingContext.prototype.getParameter;
                safeDefine(WebGLRenderingContext.prototype, "getParameter", {
                    value: maskNative(function (p) {
                        if (p === 37445) return d.webgl.vendor;
                        if (p === 37446) return d.webgl.renderer;
                        return origGetParam.call(this, p);
                    }, "getParameter")
                }, "WebGLRenderingContext.getParameter");
            }
        } catch (e) {}
        try {
            if (typeof WebGL2RenderingContext !== "undefined" && WebGL2RenderingContext.prototype) {
                const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
                safeDefine(WebGL2RenderingContext.prototype, "getParameter", {
                    value: maskNative(function (p) {
                        if (p === 37445) return d.webgl.vendor;
                        if (p === 37446) return d.webgl.renderer;
                        return origGetParam2.call(this, p);
                    }, "getParameter")
                }, "WebGL2RenderingContext.getParameter");
            }
        } catch (e) {}
        if (f.canvasSpoof) {
            try {
                const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
                const origToBlob = HTMLCanvasElement.prototype.toBlob;
                const injectNoise = function (canvas) {
                    try {
                        const ctx = canvas.getContext("2d");
                        if (!ctx || canvas.width === 0 || canvas.height === 0) return;
                        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const data = img.data;
                        const w = canvas.width;
                        for (let y = 0; y < canvas.height; y++) {
                            for (let x = 0; x < w; x++) {
                                const i = (y * w + x) * 4;
                                data[i] = Math.min(255, Math.max(0, data[i] + pixelHash(x, y, 0, seed)));
                                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + pixelHash(x, y, 1, seed)));
                                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + pixelHash(x, y, 2, seed)));
                            }
                        }
                        ctx.putImageData(img, 0, 0);
                    } catch (e) {}
                };
                safeDefine(HTMLCanvasElement.prototype, "toDataURL", {
                    value: maskNative(function () {
                        injectNoise(this);
                        return origToDataURL.apply(this, arguments);
                    }, "toDataURL")
                }, "HTMLCanvasElement.toDataURL");
                safeDefine(HTMLCanvasElement.prototype, "toBlob", {
                    value: maskNative(function (cb) {
                        injectNoise(this);
                        return origToBlob.call(this, cb, ...Array.prototype.slice.call(arguments, 1));
                    }, "toBlob")
                }, "HTMLCanvasElement.toBlob");
                const origMeasure = CanvasRenderingContext2D.prototype.measureText;
                safeDefine(CanvasRenderingContext2D.prototype, "measureText", {
                    value: maskNative(function (text) {
                        const m = origMeasure.call(this, text);
                        const font = this.font || "";
                        const isSpoofed = d.fonts.some(function (ff) {
                            return font.includes(ff);
                        });
                        if (isSpoofed && text) {
                            const w = m.width;
                            const hashVal = pixelHash(text.length, text.charCodeAt(0) || 0, 0, seed);
                            try {
                                Object.defineProperty(m, "width", {
                                    get: function () {
                                        return w * (1 + hashVal / 50000);
                                    },
                                    configurable: true,
                                    enumerable: true
                                });
                            } catch (e) {}
                        }
                        return m;
                    }, "measureText")
                }, "CanvasRenderingContext2D.measureText");
                const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                safeDefine(CanvasRenderingContext2D.prototype, "getImageData", {
                    value: maskNative(function (sx, sy, sw, sh, settings) {
                        const img = origGetImageData.call(this, sx, sy, sw, sh, settings);
                        const data = img.data;
                        for (let y = 0; y < sh; y++) {
                            for (let x = 0; x < sw; x++) {
                                const i = (y * sw + x) * 4;
                                data[i] = Math.min(255, Math.max(0, data[i] + pixelHash(sx + x, sy + y, 0, seed)));
                                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + pixelHash(sx + x, sy + y, 1, seed)));
                                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + pixelHash(sx + x, sy + y, 2, seed)));
                            }
                        }
                        return img;
                    }, "getImageData")
                }, "CanvasRenderingContext2D.getImageData");
            } catch (e) {}
        }
        if (f.fontSpoof) {
            try {
                const fontSet = d.fonts;
                const OrigFontFaceSet = typeof FontFaceSet !== "undefined" ? FontFaceSet : EventTarget;
                const OrigFontFace = typeof FontFace !== "undefined" ? FontFace : function () {};
                const makeFontFace = function (family) {
                    try {
                        const ff = new OrigFontFace(family, 'local("' + family + '")');
                        try {
                            Object.defineProperty(ff, "status", { get: function () { return "loaded"; }, enumerable: true });
                            Object.defineProperty(ff, "loaded", { value: Promise.resolve(ff), enumerable: true });
                        } catch (e) {}
                        return ff;
                    } catch (e) {
                        return {
                            family: family,
                            style: "normal",
                            weight: "400",
                            stretch: "normal",
                            unicodeRange: "U+0-10FFFF",
                            variant: "normal",
                            featureSettings: "normal",
                            display: "auto",
                            status: "loaded",
                            loaded: Promise.resolve(null),
                            load: function () { return Promise.resolve(this); }
                        };
                    }
                };
                const faceCache = fontSet.map(makeFontFace);
                const spoofedSet = Object.create(OrigFontFaceSet.prototype);
                Object.defineProperty(spoofedSet, "size", { get: function () { return faceCache.length; }, enumerable: true });
                Object.defineProperty(spoofedSet, "ready", { value: Promise.resolve(spoofedSet), enumerable: true });
                Object.defineProperty(spoofedSet, "status", { value: "loaded", enumerable: true });
                Object.defineProperty(spoofedSet, "onloading", { value: null, writable: true, enumerable: true });
                Object.defineProperty(spoofedSet, "onloadingdone", { value: null, writable: true, enumerable: true });
                Object.defineProperty(spoofedSet, "onloadingerror", { value: null, writable: true, enumerable: true });
                spoofedSet.check = maskNative(function (font) {
                    const families = String(font || "").split(",").map(function (f) {
                        return f.trim().replace(/['"]/g, "").split(/\s+/).pop();
                    });
                    return families.some(function (f) {
                        return fontSet.includes(f);
                    });
                }, "check");
                spoofedSet.load = maskNative(function () {
                    return Promise.resolve([]);
                }, "load");
                spoofedSet.add = maskNative(function () {
                    return spoofedSet;
                }, "add");
                spoofedSet.delete = maskNative(function () {
                    return true;
                }, "delete");
                spoofedSet.clear = maskNative(function () {}, "clear");
                spoofedSet.has = maskNative(function (font) {
                    return fontSet.includes(font);
                }, "has");
                spoofedSet.forEach = maskNative(function (cb, thisArg) {
                    faceCache.forEach(function (f) {
                        cb.call(thisArg, f, f, spoofedSet);
                    });
                }, "forEach");
                spoofedSet.values = function () {
                    return faceCache[Symbol.iterator]();
                };
                spoofedSet.entries = function () {
                    return faceCache.map(function (f) { return [f, f]; })[Symbol.iterator]();
                };
                spoofedSet.keys = function () {
                    return faceCache[Symbol.iterator]();
                };
                spoofedSet[Symbol.iterator] = function () {
                    return faceCache[Symbol.iterator]();
                };
                if (typeof Document !== "undefined" && Document.prototype) {
                    safeDefine(Document.prototype, "fonts", { get: function () { return spoofedSet; }, configurable: true }, "Document.fonts");
                }
            } catch (e) {}
        }
        if (f.audioSpoof) {
            try {
                const origOffline = window.OfflineAudioContext;
                if (origOffline) {
                    safeDefine(window, "OfflineAudioContext", {
                        value: maskNative(function (ch, len, sr) {
                            const ctx = new origOffline(ch, len, sr);
                            const origRender = ctx.startRendering.bind(ctx);
                            ctx.startRendering = maskNative(function () {
                                return origRender().then(function (buffer) {
                                    for (let i = 0; i < buffer.numberOfChannels; i++) {
                                        const chData = buffer.getChannelData(i);
                                        for (let j = 0; j < chData.length; j++) {
                                            chData[j] += pixelHash(i, j, 0, seed) * 0.000001;
                                        }
                                    }
                                    return buffer;
                                });
                            }, "startRendering");
                            return ctx;
                        }, "OfflineAudioContext")
                    }, "OfflineAudioContext.window");
                }
            } catch (e) {}
        }
        if (f.batterySpoof) {
            try {
                if (navigator.getBattery) {
                    const origGetBattery = navigator.getBattery;
                    safeDefine(navigator, "getBattery", {
                        value: maskNative(function () {
                            return origGetBattery.call(this).then(function (b) {
                                const BatteryCtor = globalThis["BatteryManager"];
                                const BatteryProto = typeof BatteryCtor === "function" ? BatteryCtor.prototype : Object.getPrototypeOf(b);
                                safeDefine(BatteryProto, "level", { get: function () { return d.battery.level; }, enumerable: true }, "BatteryManager.level");
                                safeDefine(BatteryProto, "charging", { get: function () { return d.battery.charging; }, enumerable: true }, "BatteryManager.charging");
                                safeDefine(BatteryProto, "chargingTime", { get: function () { return d.battery.chargingTime; }, enumerable: true }, "BatteryManager.chargingTime");
                                safeDefine(BatteryProto, "dischargingTime", { get: function () { return d.battery.dischargingTime; }, enumerable: true }, "BatteryManager.dischargingTime");
                                return b;
                            });
                        }, "getBattery")
                    }, "navigator.getBattery");
                }
            } catch (e) {}
        }
        if (f.webRTCBlock) {
            try {
                const OrigRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
                if (OrigRTC) {
                    const NewRTC = maskNative(function (cfg, constraints) {
                        const safeCfg = { ...(cfg || {}) };
                        if (Array.isArray(safeCfg.iceServers)) safeCfg.iceServers = [];
                        const pc = new OrigRTC(safeCfg, constraints);
                        const origCreateOffer = pc.createOffer.bind(pc);
                        const origCreateAnswer = pc.createAnswer.bind(pc);
                        const replaceSDP = function (sdp) {
                            if (!sdp) return sdp;
                            let s = sdp;
                            s = s.replace(/a=candidate:\d+ \d+ udp \d+ ([\d.]+)/g, function (m, ip) { return m.replace(ip, d.webRTC[0]); });
                            s = s.replace(/candidate:\d+ \d+ udp \d+ ([\d.]+)/g, function (m, ip) { return m.replace(ip, d.webRTC[0]); });
                            s = s.replace(/a=candidate:\d+ \d+ tcp \d+ ([\d.]+)/g, function (m, ip) { return m.replace(ip, d.webRTC[0]); });
                            s = s.replace(/o=- \d+ \d+ IN IP4 ([\d.]+)/g, function (m, ip) { return m.replace(ip, d.webRTC[0]); });
                            s = s.replace(/c=IN IP4 ([\d.]+)/g, function (m, ip) { return m.replace(ip, d.webRTC[0]); });
                            s = s.replace(/192\.168\.\d+\.\d+/g, d.localIP);
                            s = s.replace(/\b10\.\d+\.\d+\.\d+\b/g, d.localIP);
                            s = s.replace(/\b172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+\b/g, d.localIP);
                            s = s.replace(/[a-f0-9-]+\.local/gi, d.mDNS);
                            return s;
                        };
                        pc.createOffer = maskNative(async function () {
                            const offer = await origCreateOffer.apply(pc, arguments);
                            offer.sdp = replaceSDP(offer.sdp);
                            return offer;
                        }, "createOffer");
                        pc.createAnswer = maskNative(async function () {
                            const answer = await origCreateAnswer.apply(pc, arguments);
                            answer.sdp = replaceSDP(answer.sdp);
                            return answer;
                        }, "createAnswer");
                        const origGetStats = pc.getStats.bind(pc);
                        pc.getStats = maskNative(async function () {
                            const stats = await origGetStats.apply(pc, arguments);
                            if (stats && typeof stats.forEach === "function") {
                                stats.forEach(function (report) {
                                    if (report.type === "candidate-pair" || report.type === "local-candidate" || report.type === "remote-candidate") {
                                        try {
                                            if (report.address) report.address = d.webRTC[0];
                                            if (report.ip) report.ip = d.webRTC[0];
                                            if (report.candidateType) report.candidateType = "host";
                                        } catch (e) {}
                                    }
                                });
                            }
                            return stats;
                        }, "getStats");
                        return pc;
                    }, "RTCPeerConnection");
                    NewRTC.prototype = OrigRTC.prototype;
                    try {
                        Object.setPrototypeOf(NewRTC, OrigRTC);
                    } catch (e) {}
                    safeDefine(window, "RTCPeerConnection", { value: NewRTC }, "RTCPeerConnection.window");
                    safeDefine(window, "webkitRTCPeerConnection", { value: NewRTC }, "webkitRTCPeerConnection.window");
                }
            } catch (e) {}
        }
        if (f.themeSpoof || f.hdrSpoof || f.colorGamutSpoof || f.pwaSpoof) {
            try {
                const origMatch = window.matchMedia;
                safeDefine(window, "matchMedia", {
                    value: maskNative(function (query) {
                        const result = origMatch.call(window, query);
                        const spoofed = Object.create(Object.getPrototypeOf(result));
                        try {
                            Object.getOwnPropertyNames(result).forEach(function (key) {
                                try {
                                    const descriptor = Object.getOwnPropertyDescriptor(result, key);
                                    if (descriptor) Object.defineProperty(spoofed, key, descriptor);
                                } catch (e) {}
                            });
                        } catch (e) {}
                        let matchVal = result.matches;
                        if (query.includes("prefers-color-scheme") && f.themeSpoof) {
                            matchVal = query.includes(d.theme);
                        } else if (query.includes("dynamic-range") && f.hdrSpoof) {
                            matchVal = d.hdr && query.includes("high");
                        } else if (query.includes("color-gamut") && f.colorGamutSpoof) {
                            const order = ["srgb", "p3", "rec2020"];
                            const si = order.indexOf(d.gamut);
                            const qi = query.includes("rec2020") ? 2 : query.includes("p3") ? 1 : 0;
                            matchVal = qi <= si;
                        } else if (query.includes("display-mode") && f.pwaSpoof) {
                            matchVal = d.pwa && query.includes("standalone");
                        }
                        try {
                            Object.defineProperty(spoofed, "matches", {
                                get: function () { return matchVal; },
                                enumerable: true,
                                configurable: true
                            });
                            Object.defineProperty(spoofed, "media", {
                                get: function () { return result.media; },
                                enumerable: true
                            });
                        } catch (e) {}
                        spoofed.addEventListener = maskNative(function (type, listener, opts) {
                            if (typeof result.addEventListener === "function") result.addEventListener(type, listener, opts);
                        }, "addEventListener");
                        spoofed.removeEventListener = maskNative(function (type, listener, opts) {
                            if (typeof result.removeEventListener === "function") result.removeEventListener(type, listener, opts);
                        }, "removeEventListener");
                        spoofed.dispatchEvent = maskNative(function (ev) {
                            if (typeof result.dispatchEvent === "function") return result.dispatchEvent(ev);
                            return true;
                        }, "dispatchEvent");
                        if (result.addListener) spoofed.addListener = maskNative(function () {}, "addListener");
                        if (result.removeListener) spoofed.removeListener = maskNative(function () {}, "removeListener");
                        return spoofed;
                    }, "matchMedia")
                }, "matchMedia.window");
            } catch (e) {}
        }
        if (f.permissionsSpoof) {
            try {
                if (navigator.permissions && typeof Permissions !== "undefined") {
                    safeDefine(Permissions.prototype, "query", {
                        value: maskNative(function (descriptor) {
                            const name = descriptor && descriptor.name;
                            const permissionMap = d.perms || {};
                            const permissionState = permissionMap[name] || "denied";
                            const PermissionStatusProto = typeof PermissionStatus !== "undefined" ? PermissionStatus.prototype : EventTarget.prototype;
                            const status = Object.create(PermissionStatusProto);
                            Object.defineProperty(status, "state", { get: function () { return permissionState; }, enumerable: true });
                            Object.defineProperty(status, "name", { get: function () { return name; }, enumerable: true });
                            Object.defineProperty(status, "onchange", { value: null, writable: true, enumerable: true });
                            return Promise.resolve(status);
                        }, "query")
                    }, "Permissions.query");
                }
            } catch (e) {}
        }
        if (f.mediaDevicesSpoof) {
            try {
                if (navigator.mediaDevices && typeof MediaDevices !== "undefined") {
                    safeDefine(MediaDevices.prototype, "enumerateDevices", {
                        value: maskNative(function () {
                            const devices = [];
                            const MediaInfoProto = typeof MediaDeviceInfo !== "undefined" ? MediaDeviceInfo.prototype : Object.prototype;
                            const createDevice = function (kind, id) {
                                const dev = Object.create(MediaInfoProto);
                                Object.defineProperties(dev, {
                                    deviceId: { value: id, enumerable: true, configurable: true },
                                    groupId: { value: "group-" + id, enumerable: true, configurable: true },
                                    kind: { value: kind, enumerable: true, configurable: true },
                                    label: { value: "", enumerable: true, configurable: true }
                                });
                                dev.toJSON = maskNative(function () {
                                    return {
                                        deviceId: this.deviceId,
                                        groupId: this.groupId,
                                        kind: this.kind,
                                        label: this.label
                                    };
                                }, "toJSON");
                                return dev;
                            };
                            for (let i = 0; i < d.media.ai; i++) devices.push(createDevice("audioinput", "ai-" + i + "-" + seed));
                            for (let i = 0; i < d.media.ao; i++) devices.push(createDevice("audiooutput", "ao-" + i + "-" + seed));
                            for (let i = 0; i < d.media.vi; i++) devices.push(createDevice("videoinput", "vi-" + i + "-" + seed));
                            return Promise.resolve(devices);
                        }, "enumerateDevices")
                    }, "MediaDevices.enumerateDevices");
                    if (navigator.mediaDevices.getUserMedia) {
                        safeDefine(MediaDevices.prototype, "getUserMedia", {
                            value: maskNative(function () {
                                return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
                            }, "getUserMedia")
                        }, "MediaDevices.getUserMedia");
                    }
                    if (navigator.mediaDevices.getDisplayMedia) {
                        safeDefine(MediaDevices.prototype, "getDisplayMedia", {
                            value: maskNative(function () {
                                return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
                            }, "getDisplayMedia")
                        }, "MediaDevices.getDisplayMedia");
                    }
                }
            } catch (e) {}
        }
        if (f.webGPUSpoof) {
            try {
                if (typeof Navigator !== "undefined" && Navigator.prototype) {
                    if (d.webgpu) {
                        safeDefine(Navigator.prototype, "gpu", {
                            get: function () {
                                return {
                                    requestAdapter: maskNative(async function () {
                                        return {
                                            requestDevice: maskNative(async function () {
                                                return {
                                                    queue: { submit: maskNative(function () {}, "submit") },
                                                    features: new Set(["texture-compression-bc", "depth-clip-control"]),
                                                    limits: { maxTextureDimension2D: 16384, maxBindGroups: 4 },
                                                    destroy: maskNative(function () {}, "destroy"),
                                                    createShaderModule: maskNative(function () { return {}; }, "createShaderModule")
                                                };
                                            }, "requestDevice"),
                                            features: new Set(["texture-compression-bc"]),
                                            limits: { maxTextureDimension2D: 16384 },
                                            requestAdapterInfo: maskNative(async function () {
                                                return { vendor: "nvidia", architecture: "ampere", device: "NVIDIA GeForce RTX 4070", description: "" };
                                            }, "requestAdapterInfo"),
                                            isFallbackAdapter: false
                                        };
                                    }, "requestAdapter")
                                };
                            },
                            configurable: true
                        }, "Navigator.gpu");
                    } else {
                        safeDefine(Navigator.prototype, "gpu", { get: function () { return undefined; }, configurable: true }, "Navigator.gpu");
                    }
                }
            } catch (e) {}
        }
        if (f.referrerSpoof) {
            try {
                if (typeof Document !== "undefined" && Document.prototype) {
                    safeDefine(Document.prototype, "referrer", { get: function () { return d.referrer; }, configurable: true }, "Document.referrer");
                }
            } catch (e) {}
        }
        if (f.pwaSpoof) {
            try {
                if (typeof Navigator !== "undefined" && Navigator.prototype) {
                    safeDefine(Navigator.prototype, "standalone", { get: function () { return d.pwa; }, configurable: true }, "Navigator.standalone");
                }
            } catch (e) {}
        }
        if (f.touchSpoof && d.touch === 0) {
            try {
                safeDefine(window, "ontouchstart", { get: function () { return undefined; }, configurable: true }, "Window.ontouchstart");
                safeDefine(window, "ontouchend", { get: function () { return undefined; }, configurable: true }, "Window.ontouchend");
                safeDefine(window, "ontouchmove", { get: function () { return undefined; }, configurable: true }, "Window.ontouchmove");
                safeDefine(window, "ontouchcancel", { get: function () { return undefined; }, configurable: true }, "Window.ontouchcancel");
                if (typeof Document !== "undefined" && Document.prototype) {
                    safeDefine(Document.prototype, "ontouchstart", { get: function () { return undefined; }, configurable: true }, "Document.ontouchstart");
                    safeDefine(Document.prototype, "ontouchend", { get: function () { return undefined; }, configurable: true }, "Document.ontouchend");
                    safeDefine(Document.prototype, "ontouchmove", { get: function () { return undefined; }, configurable: true }, "Document.ontouchmove");
                    safeDefine(Document.prototype, "ontouchcancel", { get: function () { return undefined; }, configurable: true }, "Document.ontouchcancel");
                }
            } catch (e) {}
        }
        if (f.orientationSpoof) {
            try {
                if (typeof ScreenOrientation !== "undefined" && screen.orientation) {
                    safeDefine(ScreenOrientation.prototype, "type", { get: function () { return d.orientation.type; }, enumerable: true }, "ScreenOrientation.type");
                    safeDefine(ScreenOrientation.prototype, "angle", { get: function () { return d.orientation.angle; }, enumerable: true }, "ScreenOrientation.angle");
                }
            } catch (e) {}
        }
        if (f.geoSpoof) {
            try {
                if (navigator.geolocation && typeof Navigator !== "undefined" && Navigator.prototype) {
                    safeDefine(Navigator.prototype, "geolocation", {
                        get: function () {
                            return {
                                getCurrentPosition: maskNative(function (success, error) {
                                    if (d.geo && typeof success === "function") {
                                        success({
                                            coords: {
                                                latitude: d.geo.lat,
                                                longitude: d.geo.lon,
                                                accuracy: d.geo.acc,
                                                altitude: null,
                                                altitudeAccuracy: null,
                                                heading: null,
                                                speed: null
                                            },
                                            timestamp: Date.now()
                                        });
                                    } else if (typeof error === "function") {
                                        error(new DOMException("User denied geolocation", "PermissionDeniedError"));
                                    }
                                }, "getCurrentPosition"),
                                watchPosition: maskNative(function (success, error) {
                                    if (d.geo && typeof success === "function") {
                                        success({
                                            coords: {
                                                latitude: d.geo.lat,
                                                longitude: d.geo.lon,
                                                accuracy: d.geo.acc,
                                                altitude: null,
                                                altitudeAccuracy: null,
                                                heading: null,
                                                speed: null
                                            },
                                            timestamp: Date.now()
                                        });
                                    } else if (typeof error === "function") {
                                        error(new DOMException("User denied geolocation", "PermissionDeniedError"));
                                    }
                                    return Math.floor(Math.random() * 1000000);
                                }, "watchPosition"),
                                clearWatch: maskNative(function () {}, "clearWatch")
                            };
                        },
                        configurable: true
                    }, "Navigator.geolocation");
                }
            } catch (e) {}
        }
        if (f.speechSpoof) {
            try {
                if (typeof speechSynthesis !== "undefined" && typeof SpeechSynthesis !== "undefined") {
                    safeDefine(SpeechSynthesis.prototype, "getVoices", {
                        value: maskNative(function () {
                            if (d.speech && d.speech.voices && d.speech.voices.length) {
                                const SpeechVoiceProto = typeof SpeechSynthesisVoice !== "undefined" ? SpeechSynthesisVoice.prototype : Object.prototype;
                                return d.speech.voices.map(function (name, i) {
                                    const v = Object.create(SpeechVoiceProto);
                                    Object.defineProperties(v, {
                                        name: { value: name, enumerable: true },
                                        lang: { value: d.lang, enumerable: true },
                                        voiceURI: { value: name, enumerable: true },
                                        default: { value: i === 0, enumerable: true },
                                        localService: { value: true, enumerable: true }
                                    });
                                    return v;
                                });
                            }
                            return [];
                        }, "getVoices")
                    }, "SpeechSynthesis.getVoices");
                }
            } catch (e) {}
        }
        if (f.bluetoothSpoof) {
            try {
                const BluetoothCtor = globalThis["Bluetooth"];
                if (navigator.bluetooth && typeof BluetoothCtor === "function") {
                    safeDefine(BluetoothCtor.prototype, "requestDevice", {
                        value: maskNative(function () {
                            return Promise.reject(new DOMException("User denied", "NotFoundError"));
                        }, "requestDevice")
                    }, "Bluetooth.requestDevice");
                }
            } catch (e) {}
        }
        if (f.usbSpoof) {
            try {
                const USBCtor = globalThis["USB"];
                if (navigator.usb && typeof USBCtor === "function") {
                    safeDefine(USBCtor.prototype, "requestDevice", {
                        value: maskNative(function () {
                            return Promise.reject(new DOMException("User denied", "NotFoundError"));
                        }, "requestDevice")
                    }, "USB.requestDevice");
                }
            } catch (e) {}
        }
        if (f.storageSpoof) {
            try {
                if (navigator.storage && navigator.storage.estimate && typeof StorageManager !== "undefined") {
                    safeDefine(StorageManager.prototype, "estimate", {
                        value: maskNative(function () {
                            return Promise.resolve({
                                quota: d.storage.quota,
                                usage: d.storage.usage,
                                usageDetails: {}
                            });
                        }, "estimate")
                    }, "StorageManager.estimate");
                    if (StorageManager.prototype.persisted) {
                        safeDefine(StorageManager.prototype, "persisted", {
                            value: maskNative(function () {
                                return Promise.resolve(d.storage.persisted);
                            }, "persisted")
                        }, "StorageManager.persisted");
                    }
                }
            } catch (e) {}
        }
    }
function computeLifecycle() {
    const marker = loadRestartMarker();
    if (marker && marker.revision === state.revision) {
        clearRestartMarker();
        state.lifecycle = STATES.READY_AFTER_RESTART;
        return {
            launch: false,
            validRestart: true
        };
    }
    if (marker && marker.revision !== state.revision) {
        clearRestartMarker();
        state.lifecycle = STATES.RESTART_REQUIRED;
        return {
            launch: false,
            validRestart: false
        };
    }
    state.lifecycle = STATES.IDLE;
    return {
        launch: false,
        validRestart: false
    };
}
    function registerListener(target, type, handler, options) {
        if (!target || typeof target.addEventListener !== "function") return;
        target.addEventListener(type, handler, options);
        const disposer = function () {
            try {
                target.removeEventListener(type, handler, options);
            } catch (e) {}
        };
        state.listeners.add(disposer);
        return disposer;
    }
    function registerTimer(id, clearFn) {
        state.timers.add(function () {
            try {
                clearFn(id);
            } catch (e) {}
        });
        return id;
    }
    function registerFrame(id) {
        state.frames.add(id);
        return id;
    }
    function cancelAllRuntimeTasks() {
        state.listeners.forEach(function (dispose) {
            try {
                dispose();
            } catch (e) {}
        });
        state.listeners.clear();
        state.timers.forEach(function (clear) {
            try {
                clear();
            } catch (e) {}
        });
        state.timers.clear();
        state.frames.forEach(function (id) {
            try {
                cancelAnimationFrame(id);
            } catch (e) {}
        });
        state.frames.clear();
        state.observers.forEach(function (observer) {
            try {
                observer.disconnect();
            } catch (e) {}
        });
        state.observers.clear();
    }
    function createSVG(content, viewBox, extra) {
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", viewBox || "0 0 24 24");
        svg.setAttribute("fill", "none");
        if (extra) {
            Object.keys(extra).forEach(function (key) {
                svg.setAttribute(key, extra[key]);
            });
        }
        const wrapper = document.createElementNS(NS, "g");
        wrapper.innerHTML = content;
        while (wrapper.firstChild) svg.appendChild(wrapper.firstChild);
        return svg;
    }
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function iconBox(icon) {
        const box = el("div", "lk-icon-box");
        box.appendChild(createSVG(SVG_PATHS[icon] || "", "0 0 24 24"));
        return box;
    }
    function makeTile(title, description, icon, action, ariaLabel) {
        const button = el("button", "lk-tile");
        button.type = "button";
        button.tabIndex = 0;
        button.setAttribute("aria-label", ariaLabel || title);
        button.appendChild(iconBox(icon));
        const text = el("div", "munitos-tile-text");
        text.appendChild(el("h3", "", title));
        if (description) text.appendChild(el("p", "", description));
        button.appendChild(text);
        registerListener(button, "click", action);
        registerListener(button, "keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                action(event);
            }
        });
        return button;
    }
    function makeHeader(title, backRoute) {
        const header = el("div", "lk-header");
        const back = el("button", "lk-back-btn" + (backRoute ? " show" : ""));
        back.type = "button";
        back.setAttribute("aria-label", "Back");
        back.title = "Back";
        back.appendChild(createSVG(SVG_PATHS.back, "0 0 24 24", {
            "stroke": "currentColor",
            "stroke-width": "1.4"
        }));
        if (backRoute) {
            registerListener(back, "click", function () {
                navigate(backRoute);
            });
            registerListener(back, "keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(backRoute);
                }
            });
        }
        header.appendChild(back);
        header.appendChild(el("h1", "lk-title", title));
        return header;
    }
    function createScreen(id, title, backRoute) {
        const screen = el("section", "lk-screen");
        screen.dataset.route = id;
        screen.setAttribute("aria-labelledby", "lk-title-" + id);
        const header = makeHeader(title, backRoute);
        const titleNode = header.querySelector(".lk-title");
        if (titleNode) titleNode.id = "lk-title-" + id;
        screen.appendChild(header);
        state.screens.set(id, screen);
        return screen;
    }
    function createMainScreen() {
        const screen = createScreen("main", "MUNITOS Recovery", null);
        const grid = el("div", "lk-grid");
        grid.appendChild(makeTile("Run MUNITOS", "Start the MUNITOS environment", "run", function () {
            navigate("run-light-munitos");
        }));
        grid.appendChild(makeTile("System Recovery", "Repair and restore system tools", "recovery", function () {
            navigate("system-recovery");
        }));
        screen.appendChild(grid);
        const more = el("button", "lk-more-link", "Online Help");
        more.type = "button";
        more.setAttribute("aria-label", "Open Online Help");
        registerListener(more, "click", function () {
            navigate("online-help");
        });
        registerListener(more, "keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate("online-help");
            }
        });
        screen.appendChild(more);
        return screen;
    }
    function createRunScreen() {
        const screen = createScreen("run-light-munitos", "Run MUNITOS", "main");
        const content = el("div", "lk-sub-content");
        const p1 = el("p", "", "Start the MUNITOS environment and continue to the secure desktop.");
        const p2 = el("p", "");
        const badge = el("span", "munitos-status-badge ready", "Environment Ready");
        p2.appendChild(badge);
        const action = el("button", "lk-action-link", "Run MUNITOS");
        action.type = "button";
        registerListener(action, "click", function () {
            runMUNITOS();
        });
        registerListener(action, "keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                runMUNITOS();
            }
        });
        content.appendChild(p1);
        content.appendChild(p2);
        content.appendChild(action);
        screen.appendChild(content);
        return screen;
    }
    function createSystemRecoveryScreen() {
        const screen = createScreen("system-recovery", "System Recovery", "main");
        const grid = el("div", "lk-grid");
        const spoofTile = makeTile("Enable Spoofing", "Fingerprint protection is currently OFF", "spoof", toggleFingerprintSpoof);
        spoofTile.dataset.component = "spoof-toggle";
        const iconTile = makeTile("Country / Region", "Current: United States", "country", function () {
            navigate("country-select");
        });
        iconTile.dataset.component = "country";
        const featureTile = makeTile("Browser Features", "Configure fingerprint protection features", "feature", function () {
            navigate("feature-settings");
        });
        featureTile.dataset.component = "features";
        const profileTile = makeTile("Profile Selection", "Current: MUNITOS Linux", "profile", function () {
            navigate("profile-select");
        });
        profileTile.dataset.component = "profile";
        const resetTile = makeTile("Reset Factory Defaults", "Restore all spoofing settings to defaults", "reset", resetFingerprintSpoof);
        const reinstallTile = makeTile("Reinstall MUNITOS", "Clear data and reload the environment", "reinstall", reinstallMUNITOS);
        const proxyTile = makeTile("FreeUserProxy", "Manage system and user proxies from BIOS", "proxy", function () {
            navigate("proxy-settings");
        });
        proxyTile.dataset.component = "proxy-settings";
        grid.appendChild(spoofTile);
        grid.appendChild(iconTile);
        grid.appendChild(featureTile);
        grid.appendChild(profileTile);
        grid.appendChild(resetTile);
        grid.appendChild(reinstallTile);
        grid.appendChild(proxyTile);
        screen.appendChild(grid);
        return screen;
    }
    function createOnlineHelpScreen() {
        const screen = createScreen("online-help", "Online Help", "main");
        const content = el("div", "lk-sub-content");
        content.appendChild(el("p", "", "Get help, documentation, recovery guides, and troubleshooting information online."));
        const action = el("button", "lk-action-link", "Open MUNITOS Support");
        action.type = "button";
        registerListener(action, "click", openSupport);
        registerListener(action, "keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openSupport();
            }
        });
        content.appendChild(action);
        screen.appendChild(content);
        return screen;
    }
    function createCountryScreen() {
        const screen = createScreen("country-select", "Country / Region", "system-recovery");
        const grid = el("div", "munitos-country-grid");
        grid.dataset.component = "country-grid";
        screen.appendChild(grid);
        return screen;
    }
    function createFeatureScreen() {
        const screen = createScreen("feature-settings", "Browser Features", "system-recovery");
        const grid = el("div", "munitos-feature-grid");
        grid.dataset.component = "feature-grid";
        screen.appendChild(grid);
        return screen;
    }
    function createProfileScreen() {
        const screen = createScreen("profile-select", "Profile Selection", "system-recovery");
        const grid = el("div", "lk-grid");
        const profiles = [
            ["munitos", "MUNITOS Linux", "Linux x86_64 - 8 cores - 8GB RAM", "munitos"],
            ["windows11", "Windows 11", "Win32 - 16 cores - 16GB RAM", "windows"],
            ["s25", "Samsung S25", "Android 14 - 8 cores - 8GB RAM", "phone"]
        ];
        profiles.forEach(function (entry) {
            const tile = makeTile(entry[1], entry[2], entry[3], function () {
                setProfile(entry[0]);
            });
            const text = tile.querySelector(".munitos-tile-text");
            const badge = el("span", "munitos-status-badge current", "CURRENT");
            badge.dataset.profileBadge = entry[0];
            if (entry[0] !== state.config.profile) badge.hidden = true;
            text.appendChild(badge);
            grid.appendChild(tile);
        });
        screen.appendChild(grid);
        return screen;
    }
    function buildUI() {
        state.root = el("div", "");
        state.root.id = "munitos-recovery-runtime";
        state.root.setAttribute("role", "application");
        state.root.setAttribute("aria-label", "MUNITOS Recovery");
        state.style = document.createElement("style");
        state.style.setAttribute("data-munitos-recovery-style", "v1");
        state.style.textContent = CSS;
        state.root.appendChild(state.style);
        const bgWrap = el("div", "lk-bg-wrap");
        bgWrap.setAttribute("aria-hidden", "true");
        const bgLogo = el("div", "lk-bg");
        const logoURL = new URL("assets/img/image_smooth.svg?v=1", document.baseURI).href;
        bgLogo.style.backgroundImage = "url(\"" + logoURL.replace(/\"/g, "%22") + "\")";
        bgWrap.appendChild(bgLogo);
        bgWrap.appendChild(el("div", "lk-bg-vignette"));
        state.root.appendChild(bgWrap);
        state.app = el("div", "lk-app");
        const screens = [
            createMainScreen(),
            createRunScreen(),
            createSystemRecoveryScreen(),
            createOnlineHelpScreen(),
            createCountryScreen(),
            createFeatureScreen(),
            createProfileScreen(),
            createProxySettingsScreen()
        ];
        screens.forEach(function (screen) {
            state.app.appendChild(screen);
        });
        state.root.appendChild(state.app);
        document.documentElement.appendChild(state.root);
        renderCountries();
        renderFeatures();
        bindFreeUserProxyRuntime();
        updateUI();
        navigate(state.route, true);
    }
    function updateUI() {
        if (!state.root) return;
        const recovery = state.screens.get("system-recovery");
        if (recovery) {
            const spoofTile = recovery.querySelector('[data-component="spoof-toggle"]');
            const countryTile = recovery.querySelector('[data-component="country"]');
            const profileTile = recovery.querySelector('[data-component="profile"]');
            if (spoofTile) {
                const text = spoofTile.querySelector(".munitos-tile-text");
                if (text) {
                    const h3 = text.querySelector("h3");
                    const p = text.querySelector("p");
                    let badge = text.querySelector("[data-spoof-badge]");
                    if (!badge) {
                        badge = el("span", "munitos-status-badge", "");
                        badge.dataset.spoofBadge = "true";
                        text.appendChild(badge);
                    }
                    if (state.config.enabled) {
                        if (h3) h3.textContent = "Disable Spoofing";
                        if (p) p.textContent = "Fingerprint protection is currently ON";
                        badge.textContent = "ON";
                        badge.className = "munitos-status-badge on";
                        badge.hidden = false;
                    } else {
                        if (h3) h3.textContent = "Enable Spoofing";
                        if (p) p.textContent = "Fingerprint protection is currently OFF";
                        badge.textContent = "OFF";
                        badge.className = "munitos-status-badge off";
                        badge.hidden = false;
                    }
                }
            }
            if (countryTile) {
                const text = countryTile.querySelector(".munitos-tile-text");
                const country = COUNTRIES[state.config.country] || COUNTRIES.US;
                if (text) {
                    const p = text.querySelector("p");
                    if (p) p.textContent = "Current: " + country.name;
                    let badge = text.querySelector("[data-country-badge]");
                    if (!badge) {
                        badge = el("span", "munitos-status-badge current", "");
                        badge.dataset.countryBadge = "true";
                        text.appendChild(badge);
                    }
                    badge.textContent = state.config.country;
                }
            }
            if (profileTile) {
                const text = profileTile.querySelector(".munitos-tile-text");
                const profileName = PROFILE_NAMES[state.config.profile] || state.config.profile;
                if (text) {
                    const p = text.querySelector("p");
                    if (p) p.textContent = "Current: " + profileName;
                    let badge = text.querySelector("[data-profile-current]");
                    if (!badge) {
                        badge = el("span", "munitos-status-badge current", "");
                        badge.dataset.profileCurrent = "true";
                        text.appendChild(badge);
                    }
                    badge.textContent = PROFILE_BADGES[state.config.profile] || String(state.config.profile).toUpperCase();
                }
            }
        }
        const profileScreen = state.screens.get("profile-select");
        if (profileScreen) {
            profileScreen.querySelectorAll("[data-profile-badge]").forEach(function (badge) {
                badge.hidden = badge.dataset.profileBadge !== state.config.profile;
            });
        }
    }
    function renderCountries() {
        if (!state.root) return;
        const grid = state.root.querySelector('[data-component="country-grid"]');
        if (!grid) return;
        const fragment = document.createDocumentFragment();
        Object.entries(COUNTRIES).forEach(function (entry) {
            const code = entry[0];
            const data = entry[1];
            const item = el("button", "munitos-country-item" + (code === state.config.country ? " selected" : ""));
            item.type = "button";
            item.tabIndex = 0;
            item.setAttribute("aria-label", code + " - " + data.name);
            const label = el("span", "", code + " - " + data.name + " - " + data.lang);
            item.appendChild(label);
            if (code === state.config.country) {
                item.appendChild(el("span", "munitos-status-badge current", "CURRENT"));
            }
            registerListener(item, "click", function () {
                setCountry(code);
            });
            registerListener(item, "keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setCountry(code);
                }
            });
            fragment.appendChild(item);
        });
        grid.replaceChildren(fragment);
    }
    function renderFeatures() {
        if (!state.root) return;
        const grid = state.root.querySelector('[data-component="feature-grid"]');
        if (!grid) return;
        const fragment = document.createDocumentFragment();
        Object.keys(DEFAULT_CONFIG.features).forEach(function (key) {
            const isOn = Boolean(state.config.features[key]);
            const item = el("button", "munitos-feature-item");
            item.type = "button";
            item.tabIndex = 0;
            item.setAttribute("aria-label", FEATURE_LABELS[key] || key);
            item.setAttribute("aria-pressed", String(isOn));
            item.appendChild(el("span", "", FEATURE_LABELS[key] || key));
            item.appendChild(el("span", "munitos-status-badge " + (isOn ? "on" : "off"), isOn ? "ON" : "OFF"));
            registerListener(item, "click", function () {
                toggleFeature(key);
            });
            registerListener(item, "keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleFeature(key);
                }
            });
            fragment.appendChild(item);
        });
        grid.replaceChildren(fragment);
    }
    function navigate(route, immediate) {
        if (!ROUTES.includes(route) || state.destroyed) return;
        const previous = state.screens.get(state.route);
        const target = state.screens.get(route);
        if (!target) return;
        const activeEl = document.activeElement;
        if (activeEl && activeEl !== document.body && activeEl !== document.documentElement) {
            if (activeEl.blur) activeEl.blur();
        }
        state.route = route;
        state.screens.forEach(function (screen) {
            screen.classList.remove("active");
            screen.setAttribute("aria-hidden", "true");
            screen.inert = true;
        });
        target.classList.add("active");
        target.setAttribute("aria-hidden", "false");
        target.inert = false;
        updateUI();
    }
    function showModal() {
        if (!state.root || state.modal) return;
        const layer = el("div", "munitos-modal-layer");
        layer.setAttribute("role", "presentation");
        const modal = el("div", "lk-modal");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "lk-restart-title");
        const title = el("h2", "", "Restart required");
        title.id = "lk-restart-title";
        const message = el("p", "", "This profile was just applied.\n\nFor the new profile to take effect correctly, this page must be restarted at least once.");
        const actions = el("div", "munitos-modal-actions");
        const back = el("button", "munitos-modal-btn", "Back");
        back.type = "button";
        const restart = el("button", "munitos-modal-btn primary", "Restart and Run");
        restart.type = "button";
        actions.appendChild(back);
        actions.appendChild(restart);
        modal.appendChild(title);
        modal.appendChild(message);
        modal.appendChild(actions);
        layer.appendChild(modal);
        state.root.appendChild(layer);
        state.modal = {
            layer: layer,
            modal: modal,
            back: back,
            restart: restart
        };
        registerListener(back, "click", function () {
            closeModal();
        });
        registerListener(restart, "click", function () {
            restartAndRun();
        });
        registerListener(layer, "mousedown", function (event) {
            if (event.target === layer) closeModal();
        });
        registerListener(restart, "keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                restartAndRun();
            }
        });
        try {
            restart.focus({ preventScroll: true });
        } catch (e) {
            restart.focus();
        }
    }
    function closeModal() {
        if (!state.modal) return;
        const layer = state.modal.layer;
        state.modal = null;
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    }
    function runMUNITOS() {
        if (state.launchLock || state.destroyed) return;
        if (hasPendingRestart()) {
            showModal();
            return;
        }
        launchMUNITOS();
    }
    function restartAndRun() {
        if (state.launchLock || !state.modal) return;
        state.launchLock = true;
        const button = state.modal.restart;
        if (button) button.disabled = true;
        state.lifecycle = STATES.RESTART_REQUESTED;
        saveRevision();
        saveRestartMarker();
        launchAfterReloadFlag();
        try {
            window.dispatchEvent(new CustomEvent("munitos-recovery-restart-requested", {
                detail: { revision: state.revision }
            }));
        } catch (e) {}
        window.location.reload();
    }
    function launchAfterReloadFlag() {
        safeStorageSet(sessionStorage, STORE.RESTART, JSON.stringify({
            revision: state.revision,
            requestedAt: Date.now()
        }));
    }
    function launchMUNITOS() {
        if (state.launchLock || state.destroyed) return;
        state.launchLock = true;
        state.lifecycle = STATES.RUNNING;
        try {
            restoreAll();
        } catch (e) {}
        try {
            window.dispatchEvent(new CustomEvent("munitos-recovery-launch", {
                detail: {
                    profile: state.config.profile,
                    country: state.config.country,
                    enabled: state.config.enabled,
                    revision: state.revision,
                    state: STATES.RUNNING
                }
            }));
        } catch (e) {}
        cleanupRecoveryRuntime();
    }
    function toggleFingerprintSpoof() {
        if (state.destroyed) return;
        const before = snapshotConfig();
        state.config.enabled = !state.config.enabled;
        if (before === snapshotConfig()) return;
        saveConfig();
        createRevision();
        state.lifecycle = STATES.CONFIG_CHANGED;
        if (state.config.enabled) {
            applySpoofing(state.config.profile);
        } else {
            restoreAll();
        }
        updateUI();
    }
    function resetFingerprintSpoof() {
        if (state.destroyed) return;
        const before = snapshotConfig();
        state.config = deepClone(DEFAULT_CONFIG);
        if (before === snapshotConfig()) {
            updateUI();
            return;
        }
        saveConfig();
        createRevision();
        state.lifecycle = STATES.CONFIG_CHANGED;
        restoreAll();
        updateUI();
        renderCountries();
        renderFeatures();
    }
    function setProfile(name) {
        if (!PROFILES[name]) return;
        const before = snapshotConfig();
        state.config.profile = name;
        state.config.enabled = true;
        if (before === snapshotConfig()) {
            updateUI();
            return;
        }
        saveConfig();
        createRevision();
        state.lifecycle = STATES.CONFIG_CHANGED;
        applySpoofing(name);
        updateUI();
    }
    function setCountry(code) {
        if (!COUNTRIES[code]) return;
        const before = snapshotConfig();
        state.config.country = code;
        if (before === snapshotConfig()) {
            renderCountries();
            updateUI();
            return;
        }
        saveConfig();
        createRevision();
        state.lifecycle = STATES.CONFIG_CHANGED;
        clearRestartMarker();
        if (state.config.enabled) applySpoofing(state.config.profile);
        renderCountries();
        updateUI();
    }
    function toggleFeature(key) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG.features, key)) return;
        const before = snapshotConfig();
        state.config.features[key] = !Boolean(state.config.features[key]);
        if (before === snapshotConfig()) {
            renderFeatures();
            return;
        }
        saveConfig();
        createRevision();
        state.lifecycle = STATES.CONFIG_CHANGED;
        if (state.config.enabled) applySpoofing(state.config.profile);
        renderFeatures();
        updateUI();
    }
    let freeUserProxyLoadPromise = null;
    let proxyRenderTimer = null;
    function getFreeUserProxyManagement() {
        try { return globalThis.__FreeUserProxy?.management || globalThis.__FreeUserProxy?.api?.management || null; }
        catch (e) { return null; }
    }
    function loadFreeUserProxyRuntime() {
        if (globalThis.__FreeUserProxy?.management || globalThis.__FreeUserProxy?.api?.management) return Promise.resolve(globalThis.__FreeUserProxy);
        if (freeUserProxyLoadPromise) return freeUserProxyLoadPromise;
        freeUserProxyLoadPromise = new Promise(function (resolve, reject) {
            const startedAt = Date.now();
            let timer = null;
            const finish = function () {
                if (!(globalThis.__FreeUserProxy?.management || globalThis.__FreeUserProxy?.api?.management)) return false;
                if (timer) clearTimeout(timer);
                window.removeEventListener('munitos-free-user-proxy-ready', finish);
                resolve(globalThis.__FreeUserProxy);
                return true;
            };
            const check = function () {
                if (finish()) return;
                if (Date.now() - startedAt >= 15000) {
                    window.removeEventListener('munitos-free-user-proxy-ready', finish);
                    reject(new Error('FreeUserProxy runtime did not initialize.'));
                    return;
                }
                timer = setTimeout(check, 100);
            };
            window.addEventListener('munitos-free-user-proxy-ready', finish);
            check();
        }).finally(function () { freeUserProxyLoadPromise = null; });
        return freeUserProxyLoadPromise;
    }
    function setProxyManagementStatus(message, type) {
        const node = state.root && state.root.querySelector('[data-component="proxy-status"]');
        if (!node) return;
        node.textContent = String(message || '');
        node.className = 'munitos-proxy-status' + (type ? ' ' + type : '');
    }
    function formatProxyStatus(entry) {
        const status = entry?.status || {};
        const stateName = String(status.state || (entry?.enabled === false ? 'disabled' : 'idle')).toLowerCase();
        const statusText = status.status ? 'HTTP ' + status.status : '';
        const latency = Number.isFinite(Number(status.latencyMs)) ? ' · ' + Number(status.latencyMs) + ' ms' : '';
        const error = status.errorCode ? ' · ' + status.errorCode : '';
        return { stateName, label: stateName.toUpperCase(), detail: statusText + latency + error };
    }
    function queueProxyRender() {
        if (proxyRenderTimer !== null) return;
        const run = function () { proxyRenderTimer = null; renderProxyList(); };
        if (typeof requestAnimationFrame === 'function') proxyRenderTimer = requestAnimationFrame(run);
        else proxyRenderTimer = setTimeout(run, 0);
    }
    async function renderProxyList() {
        const list = state.root && state.root.querySelector('[data-component="proxy-list"]');
        const summary = state.root && state.root.querySelector('[data-component="proxy-summary"]');
        if (!list) return;
        const management = getFreeUserProxyManagement();
        if (!management || typeof management.list !== 'function') {
            list.replaceChildren(el('div', 'munitos-custom-empty', 'FreeUserProxy is not ready yet.'));
            return;
        }
        let entries = [];
        try { entries = await Promise.resolve(management.list()); }
        catch (e) { list.replaceChildren(el('div', 'munitos-custom-empty', e?.message || 'Unable to read proxy state.')); return; }
        if (summary) {
            const online = entries.filter(e => e?.status?.state === 'online').length;
            const enabled = entries.filter(e => e?.enabled !== false).length;
            const system = entries.filter(e => e?.type === 'System').length;
            const user = entries.filter(e => e?.type === 'User').length;
            summary.replaceChildren(
                el('span', '', `Total: ${entries.length}`),
                el('span', '', `Enabled: ${enabled}`),
                el('span', '', `Online: ${online}`),
                el('span', '', `System: ${system}`),
                el('span', '', `User: ${user}`)
            );
        }
        const fragment = document.createDocumentFragment();
        if (!entries.length) { fragment.appendChild(el('div', 'munitos-custom-empty', 'No proxy endpoints configured.')); list.replaceChildren(fragment); return; }
        entries.forEach(function (entry) {
            const item = el('div', 'munitos-proxy-item');
            const main = el('div', 'munitos-proxy-item-main');
            const top = el('div', 'munitos-proxy-item-top');
            const tag = el('span', 'munitos-proxy-tag ' + (entry.type === 'System' ? 'system' : 'user'), entry.type || 'User');
            const metaStatus = formatProxyStatus(entry);
            top.appendChild(tag);
            top.appendChild(el('div', 'munitos-proxy-name', entry.name || 'proxy'));
            top.appendChild(el('span', 'munitos-proxy-state ' + metaStatus.stateName, metaStatus.label));
            main.appendChild(top);
            main.appendChild(el('div', 'munitos-proxy-template', entry.template || ''));
            main.appendChild(el('div', 'munitos-proxy-meta', entry?.status?.errorMessage || metaStatus.detail || (entry.enabled === false ? 'Disabled from BIOS' : 'Not tested yet')));
            const actions = el('div', 'munitos-proxy-actions');
            const toggle = el('button', 'munitos-proxy-action', entry.enabled === false ? 'Enable' : 'Disable');
            toggle.type = 'button';
            toggle.title = entry.type === 'System' ? 'System proxy cannot be deleted; toggle only.' : 'Enable or disable this user proxy.';
            registerListener(toggle, 'click', async function () {
                toggle.disabled = true;
                try {
                    const result = await Promise.resolve(management.toggle(entry.id, entry.enabled === false));
                    setProxyManagementStatus(`${entry.name}: ${result.enabled ? 'enabled and retesting' : 'disabled'}.`, 'success');
                } catch (e) { setProxyManagementStatus(e?.message || 'Unable to change proxy state.', 'error'); }
                finally { queueProxyRender(); }
            });
            actions.appendChild(toggle);
            const retry = el('button', 'munitos-proxy-action', 'Retry');
            retry.type = 'button';
            registerListener(retry, 'click', async function () {
                retry.disabled = true;
                setProxyManagementStatus(`${entry.name}: testing...`, '');
                try {
                    const result = await management.test(entry.id);
                    setProxyManagementStatus(`${entry.name}: ${result.ok ? 'online' : (result.errorMessage || result.errorCode || 'failed')}.`, result.ok ? 'success' : 'error');
                } catch (e) { setProxyManagementStatus(`${entry.name}: ${e?.message || 'test failed'}.`, 'error'); }
                finally { retry.disabled = false; queueProxyRender(); }
            });
            actions.appendChild(retry);
            if (entry.type === 'User') {
                const remove = el('button', 'munitos-proxy-action', 'Remove');
                remove.type = 'button';
                registerListener(remove, 'click', async function () {
                    remove.disabled = true;
                    try {
                        const removed = await management.remove(entry.id);
                        setProxyManagementStatus(removed ? `${entry.name}: removed.` : 'Proxy was not found.', removed ? 'success' : 'error');
                    } catch (e) { setProxyManagementStatus(e?.message || 'Unable to remove proxy.', 'error'); }
                    finally { queueProxyRender(); }
                });
                actions.appendChild(remove);
            }
            item.appendChild(main);
            item.appendChild(actions);
            fragment.appendChild(item);
        });
        list.replaceChildren(fragment);
    }
    async function addCustomProxyFromBIOS() {
        const nameInput = state.root && state.root.querySelector('[data-component="proxy-name"]');
        const templateInput = state.root && state.root.querySelector('[data-component="proxy-template"]');
        const addButton = state.root && state.root.querySelector('[data-component="proxy-add"]');
        const management = getFreeUserProxyManagement();
        if (!management?.add) { setProxyManagementStatus('FreeUserProxy is not ready yet.', 'error'); return; }
        const name = String(nameInput?.value || '').trim() || 'custom';
        const template = String(templateInput?.value || '').trim();
        if (!template || !template.includes('{url}')) { setProxyManagementStatus('Proxy template must contain {url}.', 'error'); templateInput?.focus(); return; }
        if (addButton) addButton.disabled = true;
        try {
            await management.add(name, template);
            if (nameInput) nameInput.value = '';
            if (templateInput) templateInput.value = '';
            setProxyManagementStatus('User proxy added and testing now.', 'success');
            queueProxyRender();
        } catch (e) { setProxyManagementStatus(e?.message || 'Unable to add proxy.', 'error'); }
        finally { if (addButton) addButton.disabled = false; }
    }
    function createProxySettingsScreen() {
        const screen = createScreen('proxy-settings', 'FreeUserProxy Management', 'system-recovery');
        const content = el('div', 'munitos-proxy-management');
        content.appendChild(el('p', 'munitos-proxy-note', 'All system and user proxies use one pool. System proxies can be enabled or disabled but cannot be deleted. Changes apply immediately without a page refresh.'));
        const form = el('form', 'munitos-proxy-form');
        const nameInput = document.createElement('input');
        nameInput.type = 'text'; nameInput.className = 'munitos-proxy-input'; nameInput.placeholder = 'Name'; nameInput.autocomplete = 'off'; nameInput.dataset.component = 'proxy-name';
        const templateInput = document.createElement('input');
        templateInput.type = 'text'; templateInput.className = 'munitos-proxy-input'; templateInput.placeholder = 'https://example.workers.dev/?url={url}'; templateInput.autocomplete = 'off'; templateInput.spellcheck = false; templateInput.dataset.component = 'proxy-template';
        const addButton = el('button', 'munitos-proxy-action', 'Add User Proxy');
        addButton.type = 'submit'; addButton.dataset.component = 'proxy-add';
        form.appendChild(nameInput); form.appendChild(templateInput); form.appendChild(addButton);
        registerListener(form, 'submit', function (event) { event.preventDefault(); addCustomProxyFromBIOS(); });
        content.appendChild(form);
        const status = el('div', 'munitos-proxy-status', 'Loading FreeUserProxy...');
        status.setAttribute('data-component', 'proxy-status');
        content.appendChild(status);
        const summary = el('div', 'munitos-proxy-summary');
        summary.dataset.component = 'proxy-summary';
        content.appendChild(summary);
        content.appendChild(el('p', 'munitos-proxy-note', 'Proxy pool'));
        const list = el('div', 'munitos-proxy-list');
        list.dataset.component = 'proxy-list';
        content.appendChild(list);
        screen.appendChild(content);
        return screen;
    }
    function bindFreeUserProxyRuntime() {
        registerListener(window, 'munitos-free-user-proxy-ready', function () {
            setProxyManagementStatus('FreeUserProxy loaded. Proxy scan starts automatically after page load.', 'success');
            queueProxyRender();
        });
        registerListener(window, 'munitos-free-user-proxy-change', function (event) {
            const detail = event?.detail || {};
            const reason = detail.reason || 'runtime update';
            if (reason === 'scan-started') setProxyManagementStatus('Scanning all enabled proxies in one unified pool...');
            else if (reason === 'scan-complete') setProxyManagementStatus(`Proxy scan complete: ${Number(detail?.state?.workingProxies || 0)} working endpoint(s).`, 'success');
            else if (reason === 'scan-failed') setProxyManagementStatus(`Proxy scan error: ${detail?.error?.message || 'unknown error'}.`, 'error');
            queueProxyRender();
        });
        loadFreeUserProxyRuntime().then(function () {
            setProxyManagementStatus('FreeUserProxy loaded.');
            queueProxyRender();
        }).catch(function (error) { setProxyManagementStatus(error?.message || 'FreeUserProxy failed to load.', 'error'); });
        queueProxyRender();
    }
    function openSupport() {
        window.location.href = "https://munitos.github.io/support";
    }
    async function clearCookieData() {
        try {
            const allowed = new Set(SYSTEM_COOKIE_KEYS.map(String));
            if (!allowed.size || !document.cookie) return;
            const cookies = document.cookie.split(';').map(function (v) { return v.trim(); }).filter(Boolean);
            const paths = new Set(['/']);
            let path = location.pathname || '/';
            while (path && path !== '/') { paths.add(path); path = path.replace(/\/[^/]*$/, '') || '/'; }
            for (const cookie of cookies) {
                const sep = cookie.indexOf('=');
                const name = sep >= 0 ? cookie.slice(0, sep) : cookie;
                if (!allowed.has(name)) continue;
                for (const currentPath of paths) document.cookie = encodeURIComponent(name) + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + currentPath + '; SameSite=Lax';
            }
        } catch (e) {}
    }
    async function clearIndexedDB() {
        try {
            if (typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
                const dbs = await indexedDB.databases();
                for (const db of dbs) {
                    if (!db || !db.name || !SYSTEM_INDEXEDDB_NAMES.includes(db.name)) continue;
                    await new Promise(function (resolve) {
                        let finished = false;
                        const finish = function () {
                            if (finished) return;
                            finished = true;
                            resolve();
                        };
                        try {
                            const req = indexedDB.deleteDatabase(db.name);
                            req.onsuccess = finish;
                            req.onerror = finish;
                            req.onblocked = finish;
                            registerTimer(setTimeout(finish, 2500), clearTimeout);
                        } catch (e) {
                            finish();
                        }
                    });
                }
            }
        } catch (e) {}
    }
    async function clearCaches() {
        try {
            if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
                const allowed = new Set(SYSTEM_CACHE_NAMES);
                const names = await caches.keys();
                await Promise.all(names.filter(function (name) { return allowed.has(name); }).map(function (name) { return caches.delete(name); }));
            }
        } catch (e) {}
    }
    async function unregisterServiceWorkers() {
        try {
            if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
                const regs = await navigator.serviceWorker.getRegistrations();
                const origin = location.origin;
                const allowed = [origin + '/sw.js', origin + '/service-worker.js'];
                await Promise.all(regs.filter(function (registration) {
                    const url = registration?.active?.scriptURL || registration?.installing?.scriptURL || registration?.waiting?.scriptURL || '';
                    return allowed.includes(url) || (url.startsWith(origin + '/') && /munitos|kali-light/i.test(url));
                }).map(function (registration) { return registration.unregister(); }));
            }
        } catch (e) {}
    }
    async function reinstallMUNITOS() {
        if (state.destroyed) return;
        state.launchLock = true;
        try {
            const keys = SYSTEM_STORAGE_KEYS;
            for (const key of keys) localStorage.removeItem(key);
            localStorage.removeItem('munitos-free-user-proxy-custom:v1');
        } catch (e) {}
        try {
            const keys = SYSTEM_STORAGE_KEYS;
            for (const key of keys) sessionStorage.removeItem(key);
        } catch (e) {}
        await clearCookieData();
        await clearIndexedDB();
        await clearCaches();
        await unregisterServiceWorkers();
        window.location.reload();
    }
    async function boot() {
        state.config = loadConfig();
        state.revision = loadRevision();
        try { await loadFreeUserProxyRuntime(); } catch (error) {}
        const lifecycleResult = computeLifecycle();
        if (state.config.enabled && !lifecycleResult.launch) {
            applySpoofing(state.config.profile);
        }
        if (lifecycleResult.launch) {
            state.config = loadConfig();
            state.revision = loadRevision();
            applySpoofing(state.config.profile);
            launchMUNITOS();
            try { await getFreeUserProxyManagement()?.refresh?.(); } catch (error) {}
            return;
        }
        buildUI();
        try { void getFreeUserProxyManagement()?.refresh?.(); } catch (error) {}
    }
    function cleanupRecoveryRuntime() {
        if (state.destroyed) return;
        state.destroyed = true;
        closeModal();
        cancelAllRuntimeTasks();
        state.cleanupFns.forEach(function (dispose) {
            try {
                dispose();
            } catch (e) {}
        });
        state.cleanupFns.clear();
        if (state.style && state.style.parentNode) {
            try {
                state.style.parentNode.removeChild(state.style);
            } catch (e) {}
        }
        if (state.root && state.root.parentNode) {
            try {
                state.root.parentNode.removeChild(state.root);
            } catch (e) {}
        }
        state.screens.clear();
        state.root = null;
        state.app = null;
        state.style = null;
        state.modal = null;
    }
    const runtime = {
        get state() {
            return state.lifecycle;
        },
        get config() {
            return deepClone(state.config);
        },
        get revision() {
            return state.revision;
        },
        navigate: navigate,
        run: runMUNITOS,
        restartAndRun: restartAndRun,
        toggleFingerprintSpoof: toggleFingerprintSpoof,
        resetFingerprintSpoof: resetFingerprintSpoof,
        setProfile: setProfile,
        setCountry: setCountry,
        toggleFeature: toggleFeature,
        openSupport: openSupport,
        reinstallMUNITOS: reinstallMUNITOS,
        destroy: cleanupRecoveryRuntime
    };
    window[RUNTIME_KEY] = runtime;
    boot();
})();
