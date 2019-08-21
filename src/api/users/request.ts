import { Router } from "express";

// Ask a request token

const route = Router();

route.post('/', (req, res) => {
    // req.user will not be accessible
});

export default route;
