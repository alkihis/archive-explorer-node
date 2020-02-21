import { Router } from "express";
import { methodNotAllowed } from "../../helpers";
import { CLASSIC_ARCHIVE_PATH } from "../../constants";

const BaseArchiveRouter = Router();

BaseArchiveRouter.get('/', (_, res) => {
    res.sendFile(CLASSIC_ARCHIVE_PATH);
});

BaseArchiveRouter.all('/', methodNotAllowed('GET'));

export default BaseArchiveRouter;
