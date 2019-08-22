import { Router } from "express";

const route = Router();

route.all('/', (req, res) => {
    res.json({
        query: req.query,
        body: req.body
    });
})

export default route;
