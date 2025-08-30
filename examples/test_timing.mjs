import { IRCTC } from "../lib/index.mjs";

// This function will test the new timing and re-login features.
async function test_booking_timing() {
    // --- Test Configuration ---
    // Set a custom booking time for 2 minutes from now.
    const customBookTime = new Date(Date.now() + 2 * 60 * 1000);

    console.log(`Starting booking test...`);
    console.log(`Custom booking time set for: ${customBookTime.toLocaleString()}`);
    console.log(`Expected login time: ${new Date(customBookTime.getTime() - 60 * 1000).toLocaleString()}`);
    console.log(`Expected availability check time: ${new Date(customBookTime.getTime() + 200).toLocaleString()}`);
    console.log("-------------------------------------------------");


    const irctc = new IRCTC({
        userID: "XXXXX", // IMPORTANT: Replace with a valid User ID for testing
        password: "XXXXXXX", // IMPORTANT: Replace with a valid Password for testing
        // Enable the test mode with the custom time
        testConfig: {
            enabled: true,
            customBookTime: customBookTime.toISOString(),
        }
    });

    try {
        // We will attempt to book a general ticket.
        // The test mode should intercept this and use our custom timing.
        const booking_details = {
            from: "NDLS", // New Delhi
            to: "BCT", // Mumbai Central
            date: "31-08-2024", // A future date
            class: "SL",
            quota: "GN", // Using General quota to trigger the test mode
            train: "12952", // Mumbai Rajdhani
            passengers: [
                {
                    name: "Test Passenger",
                    age: 30,
                    gender: "M",
                    bert_choice: "LB"
                }
            ],
            payment_type: "3", // Using wallet to avoid real payment
        };

        console.log("Calling book() method with General quota to activate test mode...");
        // This call will not actually book a ticket but will test the timing.
        // The script will throw an error during the process because it's a test,
        // which we will catch.
        await irctc.book(booking_details);

    } catch (error) {
        console.log("\n--- Test Finished ---");
        console.log("Caught expected error during test run. This is normal.");
        console.log("Error message:", error.message);
        console.log("\nPlease verify the timestamps in the logs above to confirm timing accuracy.");
        console.log("The script should have attempted to log in 1 minute before the custom time,");
        console.log("and it should have attempted the availability check at T+200ms.");
    }
}

// Run the test
test_booking_timing();
