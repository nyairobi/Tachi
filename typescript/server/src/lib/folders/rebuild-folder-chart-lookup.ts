import type { Database, NewFolderChartLookup } from "tachi-db";

/* eslint-disable no-await-in-loop */
import { type Kysely } from "kysely";

import { computeFolderChartIdsFromFolderSql } from "./folder-query";

const INSERT_CHUNK = 500;

/**
 * Recomputes `folder_chart_lookup` from `BuildFolderQuery` / {@link computeFolderChartIdsFromFolderSql}.
 * Uses one transaction; on failure the lookup table is rolled back.
 */
export function rebuildFolderChartLookup(
	db: Kysely<Database>,
	options?: { folderId?: string },
): Promise<{ folderCount: number; rowCount: number }> {
	const run = async (txn: Kysely<Database>) => {
		const singleFolderId = options?.folderId;

		if (singleFolderId !== undefined) {
			await txn
				.deleteFrom("folder_chart_lookup")
				.where("folder_id", "=", singleFolderId)
				.execute();

			const chartIds = await computeFolderChartIdsFromFolderSql(singleFolderId, txn);
			let rowCount = 0;

			for (let i = 0; i < chartIds.length; i = i + INSERT_CHUNK) {
				const chunk = chartIds.slice(i, i + INSERT_CHUNK);
				const rows: Array<NewFolderChartLookup> = chunk.map((chart_id) => ({
					folder_id: singleFolderId,
					chart_id,
				}));

				await txn.insertInto("folder_chart_lookup").values(rows).execute();
				rowCount = rowCount + rows.length;
			}

			return { folderCount: 1, rowCount };
		}

		await txn.deleteFrom("folder_chart_lookup").execute();

		const folderRows = await txn
			.selectFrom("folder")
			.select(["folder.id", "folder.parent"])
			.execute();

		let rowCount = 0;

		for (const folderRow of folderRows) {
			const chartIds = await computeFolderChartIdsFromFolderSql(folderRow.id, txn);

			for (let i = 0; i < chartIds.length; i = i + INSERT_CHUNK) {
				const chunk = chartIds.slice(i, i + INSERT_CHUNK);
				const rows: Array<NewFolderChartLookup> = chunk.map((chart_id) => ({
					folder_id: folderRow.id,
					chart_id,
				}));

				const parent = folderRow.parent;
				if (parent !== null) {
					rows.push(
						...chunk.map((chart_id) => ({
							folder_id: parent,
							chart_id,
						})),
					);
				}

				await txn.insertInto("folder_chart_lookup").values(rows).execute();
				rowCount = rowCount + rows.length;
			}
		}

		return { folderCount: folderRows.length, rowCount };
	};

	if (db.isTransaction) {
		return run(db);
	}

	return db.transaction().execute(run);
}
