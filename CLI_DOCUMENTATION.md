# CLI Documentation for Parallel Booking Engine

This document explains how to configure and interpret the output of the parallel booking engine.

## 1. Configuration (`config.json`)

The entire system is controlled by a single `config.json` file. You must create this file in the root directory of the project.

### Top-Level Structure

```json
{
  "globalSettings": {
    "totalSessions": 10,
    "sessionsPerCredential": 2,
    "useProxies": true,
    "gcloudVision": false,
    "intelligentPartitioning": true,
    "testMode": {
      "enabled": false,
      "customBookTime": "2025-08-28T18:30:00.000Z"
    }
  },
  "credentials": [],
  "proxies": [],
  "bookingGroups": []
}
```

---

### `globalSettings`

This object contains the main settings for the booking execution.

| Key | Type | Description |
|---|---|---|
| `totalSessions` | Number | The total number of parallel sessions you want to run. |
| `sessionsPerCredential` | Number | The maximum number of sessions to launch using a single username/password. Recommended value is 1 or 2. |
| `useProxies` | Boolean | Set to `true` to enable proxy usage, `false` to disable. |
| `gcloudVision` | Boolean | Set to `true` to use Google Cloud Vision for automatic captcha solving (requires setup), `false` for manual entry. |
| `intelligentPartitioning` | Boolean | If `true`, `totalSessions` will be divided evenly among the `bookingGroups`. If `false`, you must manually specify `sessionCount` for each booking group. |
| `testMode` | Object | Contains settings for running a timed booking test with a General (`GN`) quota ticket. |
| `testMode.enabled` | Boolean | Set to `true` to enable test mode. |
| `testMode.customBookTime` | String | The custom booking time in ISO 8601 format (e.g., `"2025-08-28T18:30:00.000Z"`). |

---

### `credentials`

An array of username/password objects.

```json
"credentials": [
  {
    "userID": "your_username_1",
    "password": "your_password_1"
  },
  {
    "userID": "your_username_2",
    "password": "your_password_2"
  }
]
```

---

### `proxies`

An array of proxy URL strings.

```json
"proxies": [
  "http://user:pass@host:port",
  "http://user:pass@host2:port2"
]
```

---

### `bookingGroups`

An array of booking task objects. Each object represents a separate booking to be attempted.

| Key | Type | Description |
|---|---|---|
| `sessionCount` | Number | **(Optional)** The number of parallel sessions to allocate to this specific group. **Only use this if `intelligentPartitioning` is `false`.** |
| `journeyDetails` | Object | Contains the booking details for this group. |

#### `journeyDetails` Object

| Key | Type | Description |
|---|---|---|
| `from` | String | The station code for the origin (e.g., "NDLS"). |
| `to` | String | The station code for the destination (e.g., "BCT"). |
| `date` | String | The journey date in `DD-MM-YYYY` format. |
| `class` | String | The class code (e.g., "SL", "3A"). |
| `quota` | String | The quota code (e.g., "TQ", "GN"). |
| `train` | String | The train number (e.g., "12952"). |
| `passengers` | Array | An array of passenger objects. |
| `payment_type`| String | The payment mode. "2" for UPI, "3" for IRCTC Wallet. |

#### `passengers` Array Object

| Key | Type | Description |
|---|---|---|
| `name` | String | Full name of the passenger. |
| `age` | Number | Age of the passenger. |
| `gender` | String | "M", "F", or "T". |
| `bert_choice` | String | Berth preference (e.g., "LB", "UB"). |

---

## 2. Real-time Console Output

When you run the manager script, it will print status updates to the console. Each line will be prefixed to identify the session and the booking group it belongs to.

### Output Format

`[Session <ID> - Group <Index>]: <Status Message>`

*   `<ID>`: A unique number for each parallel session, from 1 to `totalSessions`.
*   `<Index>`: The index of the `bookingGroups` array this session is working on (starting from 0).
*   `<Status Message>`: A message describing the current action.

### Example Output

```
[Manager]: Starting 30 parallel sessions...
[Manager]: Assigning session 1 to booking group 0...
[Manager]: Assigning session 2 to booking group 1...
...
[Session 1 - Group 0]: Starting booking process...
[Session 2 - Group 1]: Starting booking process...
[Session 1 - Group 0]: Logging in with user 'your_username_1'...
[Session 2 - Group 1]: Logging in with user 'your_username_2' via proxy 'http://...'.
[Session 1 - Group 0]: Login successful.
[Session 1 - Group 0]: Captcha required. Please solve in terminal.
[Session 2 - Group 1]: Booking failed: Train is not available.
[Session 3 - Group 2]: Booking successful! PNR: 1234567890
```

This structured output will allow you (or a future UI) to easily parse the status of each concurrent booking attempt.
