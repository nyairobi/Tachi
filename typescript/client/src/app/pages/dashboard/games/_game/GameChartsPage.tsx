import useSetSubheader from "#components/layout/header/useSetSubheader";
import DifficultyCell from "#components/tables/cells/DifficultyCell";
import TitleCell from "#components/tables/cells/TitleCell";
import SortableTH from "#components/tables/components/SortableTH";
import TachiTable from "#components/tables/components/TachiTable";
import { CascadingRatingValue } from "#components/tables/headers/ChartHeader";
import ApiError from "#components/util/ApiError";
import DebounceSearch from "#components/util/DebounceSearch";
import Divider from "#components/util/Divider";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import { type GameProps } from "#types/react";
import { CreateSongMap } from "#util/data";
import { NumericSOV, StrSOV } from "#util/sorts";
import React, { useState } from "react";
import { Col, Row } from "react-bootstrap";
import {
	type ChartDocument,
	type FolderDocument,
	FormatGame,
	GameToGameGroup,
	GetGameGroupConfig,
	type integer,
	inverseTachiID,
	type SongDocument,
} from "tachi-common";

export default function GameChartsPage({ game }: GameProps) {
	useSetSubheader(["Games", FormatGame(game), "Charts"], [game], `${FormatGame(game)} Songs`);

	const [search, setSearch] = useState("");

	return (
		<Row>
			<Col xs={12}>
				<DebounceSearch placeholder="Search songs and charts..." setSearch={setSearch} />
				<Divider />
			</Col>
			<Col xs={12}>
				<SearchSongsTable game={game} search={search} />
			</Col>
		</Row>
	);
}

function SearchSongsTable({ game, search }: { search: string } & GameProps) {
	const [orderBy, setOrderBy] = useState<"latest" | "popularity">("popularity");
	const params = new URLSearchParams({});

	if (search !== "") {
		params.append("search", search);
	}
	if (orderBy === "latest") {
		params.append("sortByLatest", "true");
	}

	const { data, error } = useApiQuery<{
		charts: ({ __playcount: integer } & ChartDocument)[];
		songs: SongDocument[];
	}>(`/games/${game}/charts?${params.toString()}`);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	const songMap = CreateSongMap(data.songs);

	const dataset = [];

	for (const chart of data.charts) {
		dataset.push({
			...chart,
			__related: {
				song: songMap.get(chart.song.id)!,
			},
		});
	}

	return (
		<>
			{search === "" && (
				<div className="w-100 text-center">
					<h4>
						Displaying {orderBy === "popularity" ? "the most played" : "latest"} charts
						for {FormatGame(game)}
					</h4>
					<Divider />
				</div>
			)}
			<TachiTable
				dataset={dataset}
				entryName="Charts"
				headers={[
					[
						"Chart",
						"Chart",
						(a, b) => CascadingRatingValue(game, a, b),
						() => (
							<th>
								<div className="vstack align-items-center text-nowrap gap-1">
									<span className="d-none d-xl-block">{"Chart"}</span>
									<span className="d-block d-xl-none">{"Chart"}</span>
								</div>
							</th>
						),
					],
					[
						"Song Title",
						"Song",
						StrSOV((x) => x.__related.song.title),
						() => (
							<th>
								<div className="vstack align-items-center text-nowrap gap-1">
									<span className="d-none d-xl-block">{"Song Title"}</span>
									<span className="d-block d-xl-none">{"Song"}</span>
								</div>
							</th>
						),
					],
					["", ""],
					[
						"Playcount",
						"Playcount",
						NumericSOV((x) => x.__playcount),
						(em) => {
							em.changeSort = () => {
								setOrderBy("popularity");
							};
							return (
								<SortableTH
									{...em}
									currentSortMode={orderBy}
									key={`header-${"playcount"}`}
									name={"Playcount"}
									oneDirectional
									reverseSort={false}
									shortName={"playcount"}
									sortingName={"popularity"}
								/>
							);
						},
					],
					[
						"Release time",
						"Release",
						StrSOV((x) => x.chartID),
						(em) => {
							em.changeSort = () => {
								setOrderBy("latest");
							};
							return (
								<SortableTH
									{...em}
									currentSortMode={orderBy}
									key={`header-${"latest"}`}
									name={"Added on"}
									oneDirectional
									reverseSort={false}
									shortName={"latest"}
									sortingName={"latest"}
								/>
							);
						},
					],
				]}
				rowFunction={(d) => (
					<tr>
						<DifficultyCell chart={d} game={game} />
						<TitleCell chart={d} game={game} song={d.__related.song} wide />
						<td>{d.__playcount}</td>
						<td>{inverseTachiID(d.chartID).toLocaleDateString("ja")}</td>
					</tr>
				)}
				searchFunctions={{
					title: (x) => x.__related.song.title,
					artist: (x) => x.__related.song.artist,
					playcount: (x) => x.__playcount,
					difficulty: (x) => x.difficulty,
					level: (x) => x.levelNum,
				}}
			/>
		</>
	);
}

export function FolderSongsTable({
	game,
	data,
}: {
	data: { charts: ChartDocument[]; folder: FolderDocument; songs: SongDocument[] };
} & GameProps) {
	useSetSubheader([
		"Games",
		GetGameGroupConfig(GameToGameGroup(game)).name,
		"Folders",
		data.folder.title,
	]);

	if (!data) {
		return <Loading />;
	}

	const songMap = CreateSongMap(data.songs);

	const rawDataset = [];

	for (const chart of data.charts) {
		rawDataset.push({
			...chart,
			__related: {
				song: songMap.get(chart.song.id)!,
			},
		});
	}

	const dataset = rawDataset.sort((a, b) =>
		a.__related.song.title.localeCompare(b.__related.song.title),
	);

	return (
		<>
			<div className="w-100 text-center">
				<h4>Displaying charts for {data.folder.title}</h4>
				<Divider />
			</div>
			<TachiTable
				dataset={dataset}
				entryName="Charts"
				headers={[
					["Chart", "Chart", (a, b) => CascadingRatingValue(game, a, b)],
					["Song Title", "Song", StrSOV((x) => x.__related.song.title)],
				]}
				rowFunction={(d) => (
					<tr>
						<DifficultyCell chart={d} game={game} />
						<TitleCell chart={d} game={game} song={d.__related.song} wide />
					</tr>
				)}
				searchFunctions={{
					title: (x) => x.__related.song.title,
					artist: (x) => x.__related.song.artist,
					difficulty: (x) => x.difficulty,
					level: (x) => x.levelNum,
				}}
			/>
		</>
	);
}
