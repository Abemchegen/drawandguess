import * as redis from "redis";
import { Languages, Room } from "../types";
import { configDotenv } from "dotenv";
import { exec } from "child_process";

configDotenv();

const client = redis.createClient({
  url: process.env.REDIS_URL,
});

client.on("error", (err) => {
  console.error("Redis error:", err);
  if (err.code === "ECONNREFUSED") {
    // Start a docker contianer of redis
    // startRedisContainer();
  }
});

client.connect().then(() => {
  console.log("Connect to redis");
});

const startRedisContainer = () => {
  exec("docker run -d redis", (error, stdout, stderr) => {
    if (error) {
      console.error(`Error starting Redis container: ${error.message}`);
      process.exit(1);
    }
    if (stderr) {
      console.error(`Redis container stderr: ${stderr}`);
    }
    console.log(`Redis container started: ${stdout}`);
  });
};

const ROOM_PREFIX = "room:";

export async function getRedisRoom(roomId: string): Promise<Room | null> {
  let data = await client.get(`${ROOM_PREFIX}${roomId}`);
  return data ? JSON.parse(data) : null;
}
export async function getRedisRoomTTL(roomId: string) {
  const key = ROOM_PREFIX + roomId;
  return client.ttl(key); // returns seconds or -1 (no TTL), -2 (key missing)
}
 
const DEFAULT_TTL = 3600;
export async function setRedisRoom(roomId: string, roomData: Room,  ttlSeconds?: number
) {
  const key = ROOM_PREFIX + roomId;
  const value = JSON.stringify(roomData);

 if (ttlSeconds && ttlSeconds > 0) {
    await client.set(key, value, { EX: ttlSeconds });
  } else {
    await client.set(key, value,{ EX: DEFAULT_TTL });
  }
}
export async function refreshRedisRoomTTL(roomId: string, ttlSeconds: number) {
  const key = ROOM_PREFIX + roomId;
  // If the key exists, set TTL
  await client.expire(key, ttlSeconds);
}
export async function deleteRedisRoom(roomId: string) {
  await client.del(`${ROOM_PREFIX}${roomId}`);
}

export async function getRoom(
  language: Languages = Languages.en
): Promise<Room | null> {
  const rooms = await getRooms();
  if (rooms.length <= 0) {
    return null;
  }

  for (const roomId of rooms) {
    const room = await getRedisRoom(roomId);
    if (!room) continue;
    if (
      room.players.length < room.settings.players &&
      room.settings.language === language
    ) {
      return room;
    }
  }
  return null;
}

export async function getRooms() {
  let data = await client.keys(`${ROOM_PREFIX}*`);
  if (!data) return [];
  return data.map((e) => e.replace(ROOM_PREFIX, ""));
}

export async function deleteRooms() {
  const Rooms = await client.keys(`${ROOM_PREFIX}*`);
  if (Rooms.length > 0) {
    await client.del([...Rooms]);
    console.log(`Deleted ${Rooms.length} rooms`);
  } else {
    console.log("No public rooms to delete");
  }
}
