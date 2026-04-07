import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { authConfig } from "../../config/auth";

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export function isLoggedIn(req: Request, res: Response, next: NextFunction) {
//   console.log("Coming inside isLoggedIn");
  let token: string | undefined;

  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7); // Remove 'Bearer ' prefix
  }
  // Fallback to cookie if no header
  else if ( req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res
      .status(401)
      .json({ message: "Unauthorized - No token provided" });
  }

  try {
    const decoded = jwt.verify(token, authConfig.jwtSecret) as {
      id: string;
    };
    req.user = { id: decoded.id };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized - Invalid token" });
  }
}

