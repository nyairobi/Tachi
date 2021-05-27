import t from "tap";
import { CloseAllConnections } from "../../../../../test-utils/close-connections";
import ResetDBState from "../../../../../test-utils/reset-db-state";
import mockApi from "../../../../../test-utils/mock-api";
import db from "../../../../../external/mongo/db";

t.test("GET /ir/beatoraja/charts/:chartSHA256/scores", (t) => {
    t.beforeEach(ResetDBState);

    const GAZER_SHA256 = "195fe1be5c3e74fccd04dc426e05f8a9cfa8a1059c339d0a23e99f63661f0b7d";
    const GAZER_CHARTID = "88eb6cc5683e2740cbd07f588a5f3db1db8d467b";

    t.test("Should return PB scores on a chart", async (t) => {
        await db["score-pbs"].insert({
            composedFrom: {
                lampPB: "mock_lampPB",
            },
            scoreData: {
                lampIndex: 4,
                score: 1234,
                hitMeta: {},
            },
            scoreMeta: {},
            chartID: GAZER_CHARTID,
            userID: 1,
        } as any); // very lazy fake scores

        await db.scores.insert({
            scoreID: "mock_lampPB",
            scoreMeta: {
                inputDevice: "BM_CONTROLLER",
                random: "MIRROR",
            },
        } as any);

        const res = await mockApi
            .get(`/ir/beatoraja/charts/${GAZER_SHA256}/scores`)
            .set("X-KtchiIR-Version", "2.0.0")
            .set("Authorization", "Bearer token");

        t.equal(res.status, 200);

        t.end();
    });

    t.test("Should return 404 if chart doesnt exist", async (t) => {
        const res = await mockApi
            .get(`/ir/beatoraja/charts/INVALID/scores`)
            .set("X-KtchiIR-Version", "2.0.0")
            .set("Authorization", "Bearer token");

        t.equal(res.status, 404);

        t.end();
    });

    t.end();
});

t.teardown(CloseAllConnections);
