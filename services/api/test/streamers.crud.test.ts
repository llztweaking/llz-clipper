import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

describe("Streamers CRUD", () => {
  it("creates and lists a streamer for the authenticated user", async () => {
    const { token } = await createAuthenticatedUser("USER");

    const createResponse = await app.inject({
      method: "POST",
      url: "/streamers",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "DiParis7k", username: "diparis7k" },
    });
    expect(createResponse.statusCode).toBe(201);

    const listResponse = await app.inject({
      method: "GET",
      url: "/streamers",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);
  });

  it("does not let a user see another user's streamer", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");

    const created = await app.inject({
      method: "POST",
      url: "/streamers",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "OwnerStreamer", username: "owner" },
    });
    const streamerId = created.json().id;

    const response = await app.inject({
      method: "GET",
      url: `/streamers/${streamerId}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("updates and deletes a streamer", async () => {
    const { token } = await createAuthenticatedUser("USER");
    const created = await app.inject({
      method: "POST",
      url: "/streamers",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Name", username: "user" },
    });
    const id = created.json().id;

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/streamers/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "New Name" },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().name).toBe("New Name");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/streamers/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await app.inject({
      method: "GET",
      url: `/streamers/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getResponse.statusCode).toBe(404);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await app.inject({ method: "GET", url: "/streamers" });
    expect(response.statusCode).toBe(401);
  });
});
