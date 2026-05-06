import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, updateApiKey } from "@/lib/localDb";

// GET /api/keys/[id] - Get single key
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

// PUT /api/keys/[id] - Update key
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive, limits, name } = body;

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      updateData.name = trimmed;
    }

    // Handle limits update
    if (limits !== undefined) {
      if (limits === null) {
        // Clear all limits
        updateData.limits = null;
      } else if (typeof limits === "object") {
        const LIMIT_FIELDS = ["inputTokens5h", "inputTokens24h", "cost5h", "cost24h"];
        const validLimits = { ...(existing.limits || {}) };

        for (const field of LIMIT_FIELDS) {
          if (!(field in limits)) continue;
          const val = limits[field];
          if (val === null || val === 0) {
            validLimits[field] = null; // null = unlimited
          } else if (typeof val === "number" && val > 0) {
            validLimits[field] = val;
          } else {
            return NextResponse.json(
              { error: `Invalid limit value for ${field}: must be null or positive number` },
              { status: 400 }
            );
          }
        }

        // If all fields are null, clear entire limits object
        const allNull = LIMIT_FIELDS.every((f) => !validLimits[f]);
        updateData.limits = allNull ? null : validLimits;
      }
    }

    const updated = await updateApiKey(id, updateData);

    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}


// DELETE /api/keys/[id] - Delete API key
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
