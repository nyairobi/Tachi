import db from "external/mongo/db";
import type {
	GPTString,
	ScoreRatingAlgorithms,
	integer,
	Game,
	Playtype,
	PBScoreDocument,
} from "tachi-common";

/**
 * Curries a function that returns the sum of N best ratings on `key`.
 *
 * @param key - What rating value to sum.
 * @param n - The amount of rating values to pull.
 * @param returnMean - Optionally, if true, return the sum of these values divided by N.
 * @param nullIfNotEnoughScores - If true, return null if the total scores this user has is less than N.
 * @param multiplier - If defined, ratings will be multiplied by this value and converted to integers.
 *
 * @returns - Number if the user has scores with that rating algorithm, null if they have
 * no scores with this rating algorithm that are non-null.
 */
function CalcN<GPT extends GPTString>(
	key: ScoreRatingAlgorithms[GPT],
	n: integer,
	returnMean = false,
	nullIfNotEnoughScores = false,
	multiplier = 1
) {
	return async (game: Game, playtype: Playtype, userID: integer) => {
		const sc = await db["personal-bests"].find(
			{
				game,
				playtype,
				userID,
				isPrimary: true,
				[`calculatedData.${key}`]: { $type: "number" },
			},
			{
				limit: n,
				sort: { [`calculatedData.${key}`]: -1 },
			}
		);

		if (sc.length === 0) {
			return null;
		}

		if (nullIfNotEnoughScores && sc.length < n) {
			return null;
		}

		if (multiplier !== 1) {
			const result = sc.reduce(
				(a, e) => a + Math.round((e.calculatedData[key] ?? 0) * multiplier),
				0
			);

			if (returnMean) {
				return Math.floor(result / n) / multiplier;
			}

			return result / multiplier;
		}

		let result = sc.reduce((a, e) => a + e.calculatedData[key]!, 0);

		if (returnMean) {
			result = result / n;
		}

		return result;
	};
}

export function ProfileSumBestN<GPT extends GPTString>(
	key: ScoreRatingAlgorithms[GPT],
	n: integer,
	nullIfNotEnoughScores = false,
	multiplier = 1
) {
	return CalcN(key, n, false, nullIfNotEnoughScores, multiplier);
}

export function ProfileAvgBestN<GPT extends GPTString>(
	key: ScoreRatingAlgorithms[GPT],
	n: integer,
	nullIfNotEnoughScores = false,
	multiplier = 1
) {
	return CalcN(key, n, true, nullIfNotEnoughScores, multiplier);
}

export async function GetBestRatingOnSongs(
	songIDs: Array<integer>,
	userID: integer,
	game: Game,
	playtype: Playtype,
	ratingProp: "skill",
	limit: integer
): Promise<Array<PBScoreDocument>> {
	const r: Array<{ doc: PBScoreDocument }> = await db["personal-bests"].aggregate([
		{
			$match: {
				game,
				playtype,
				userID,
				songID: { $in: songIDs },
			},
		},
		{
			$sort: {
				[`calculatedData.${ratingProp}`]: -1,
			},
		},
		{
			$group: {
				_id: "$songID",
				doc: { $first: "$$ROOT" },
			},
		},

		// for some godforsaken reason you have to sort twice. after a grouping
		// the sort order becomes nondeterministic
		{
			$sort: {
				[`doc.calculatedData.${ratingProp}`]: -1,
			},
		},
		{
			$limit: limit,
		},
	]);

	return r.map((e) => e.doc);
}
