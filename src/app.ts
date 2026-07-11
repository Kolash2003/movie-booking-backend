import express, { Request, Response }  from 'express';
import AppRouter from './routes/v1';
import { StatusCodes } from 'http-status-codes';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';


export function createApp(): express.Application {
    const app = express();

    app.disable('x-powered-by');
    app.use(helmet());
    app.use(compression());
    app.use(cookieParser());
    app.use(cors());

    app.use("api/v1", AppRouter);
    app.use(express.urlencoded({
        extended: false
    }))

    app.get("/ping", (req: Request, res: Response) => {
        res.json({
            success: true,
            status: StatusCodes.OK,
            message: "Pong"
        })
    })

    return app;
}
