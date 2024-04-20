import { GetKaiTypeClientCredentials, KaiTypeToBaseURL } from "./utils";
import db from "external/mongo/db";
import ScoreImportFatalError from "lib/score-import/framework/score-importing/score-import-error";
import { ServerConfig } from "lib/setup/config";
import { p } from "prudence";
import nodeFetch from "utils/fetch";
import type { KtLogger } from "lib/logger/logger";
import type { KaiAuthDocument } from "tachi-common";

const REAUTH_SCHEMA = {
	access_token: "string",
};

export function CreateKaiReauthFunction(
	kaiType: "EAG" | "FLO" | "MIN",
	authDoc: KaiAuthDocument,
	logger: KtLogger,
	fetch = nodeFetch
) {
	const maybeCredentials = GetKaiTypeClientCredentials(kaiType);

	/* istanbul ignore next */
	if (!maybeCredentials) {
		logger.error(
			`No CLIENT_ID or CLIENT_SECRET was configured for ${kaiType}. Cannot create reauth function.`
		);
		throw new ScoreImportFatalError(
			500,
			`Fatal error in performing authentication. This has been reported.`
		);
	}

	const { CLIENT_ID, CLIENT_SECRET } = maybeCredentials;

	return async () => {
		let res;

		try {
			const url = `${KaiTypeToBaseURL(kaiType)}/oauth/token`;

			res = await fetch(url, {
				body: new URLSearchParams({
					refresh_token: authDoc.refreshToken,
					grant_type: "refresh_token",
					client_secret: CLIENT_SECRET,
					client_id: CLIENT_ID,
				}).toString(),
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			});
		} catch (err) {
			logger.error(`Unexpected error while fetching reauth?`, { res, err });
			throw new ScoreImportFatalError(
				500,
				"An error has occured while attempting reauthentication."
			);
		}

		/* istanbul ignore next */
		if (res.status !== 200) {
			const text = await res.text();

			if (res.status === 400) {
				// we now entirely expect this and have no way to fix it.
				throw new ScoreImportFatalError(
					400,
					`Your authentication with this service has expired, and a bug on their end prevents us from automatically renewing it.
					
					Please go to ${ServerConfig.OUR_URL}/u/me/integrations/services to un-link and re-link.`
				);
			}

			logger.error(`Unexpected ${res.status} error while fetching reauth?`, { res, text });
			throw new ScoreImportFatalError(
				500,
				"An error has occured while attempting reauthentication."
			);
		}

		let json;
		/* istanbul ignore next */

		try {
			json = (await res.json()) as unknown;
		} catch (err) {
			logger.error(`Invalid JSON body in successful reauth response.`, { res, err });
			throw new ScoreImportFatalError(
				500,
				"An error has occured while attempting reauthentication."
			);
		}

		const err = p(json, REAUTH_SCHEMA, {}, { allowExcessKeys: true, throwOnNonObject: false });

		if (err) {
			logger.error(`Invalid JSON body in successful reauth response.`, { err, json });
			throw new ScoreImportFatalError(
				500,
				"An error has occured while attempting reauthentication."
			);
		}

		// asserted by prudence
		const validatedContent = json as {
			access_token: string;
		};

		await db["kai-auth-tokens"].update(
			{
				userID: authDoc.userID,
				service: authDoc.service,
			},
			{
				$set: {
					token: validatedContent.access_token,
				},
			}
		);

		return validatedContent.access_token;
	};
}
