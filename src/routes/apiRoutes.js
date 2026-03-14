import * as homeInfoController from "../controllers/homeInfo.controller.js";
import * as categoryController from "../controllers/category.controller.js";
import * as animeInfoController from "../controllers/animeInfo.controller.js";
import * as streamController from "../controllers/streamInfo.controller.js";
import * as searchController from "../controllers/search.controller.js";
import * as episodeListController from "../controllers/episodeList.controller.js";
import * as suggestionsController from "../controllers/suggestion.controller.js";
import * as scheduleController from "../controllers/schedule.controller.js";
import * as serversController from "../controllers/servers.controller.js";
import * as randomController from "../controllers/random.controller.js";
import * as randomIdController from "../controllers/randomId.controller.js";
import * as nextEpisodeScheduleController from "../controllers/nextEpisodeSchedule.controller.js";
import { routeTypes } from "./category.route.js";
import * as filterController from "../controllers/filter.controller.js";
import getTopSearch from "../controllers/topsearch.controller.js";

export const createApiRoutes = (app, jsonResponse, jsonError) => {
  const createRoute = (path, controllerMethod) => {
    app.get(path, async (req, res) => {
      try {
        const data = await controllerMethod(req, res);
        if (!res.headersSent) {
          return jsonResponse(res, data);
        }
      } catch (err) {
        console.error(`Error in route ${path}:`, err);
        if (!res.headersSent) {
          return jsonError(res, err.message || "Internal server error");
        }
      }
    });
  };

  ["/api", "/api/"].forEach((route) => {
    app.get(route, async (req, res) => {
      try {
        const data = await homeInfoController.getHomeInfo(req, res);
        if (!res.headersSent) {
          return jsonResponse(res, data);
        }
      } catch (err) {
        console.error("Error in home route:", err);
        if (!res.headersSent) {
          return jsonError(res, err.message || "Internal server error");
        }
      }
    });
  });

  routeTypes.forEach((routeType) =>
    createRoute(`/api/${routeType}`, (req, res) =>
      categoryController.getCategory(req, res, routeType)
    )
  );

  createRoute("/api/info", animeInfoController.getAnimeInfo);
  createRoute("/api/episodes/:id", episodeListController.getEpisodes);
  createRoute("/api/servers/:id", serversController.getServers);
  createRoute("/api/stream", (req, res) => streamController.getStreamInfo(req, res, false));
  createRoute("/api/stream/fallback", (req, res) => streamController.getStreamInfo(req, res, true));
  createRoute("/api/search", searchController.search);
  createRoute("/api/filter", filterController.filter);
  createRoute("/api/search/suggest", suggestionsController.getSuggestions);
  createRoute("/api/schedule", scheduleController.getSchedule);
  createRoute(
    "/api/schedule/:id",
    nextEpisodeScheduleController.getNextEpisodeSchedule
  );
  createRoute("/api/random", randomController.getRandom);
  createRoute("/api/random/id", randomIdController.getRandomId);
  createRoute("/api/top-search", getTopSearch);
};
