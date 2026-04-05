const express = require("express");
const router = express.Router();
const { getGroupedIncidents } = require("./rca.controller");

router.get("/incidents", getGroupedIncidents);

module.exports = router;