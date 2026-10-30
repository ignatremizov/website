"""Bounded, art-only Blender Workbench preview; no simulations or baking."""
import argparse
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector


parser = argparse.ArgumentParser()
parser.add_argument("input", type=Path)
parser.add_argument("--layout", action="store_true")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
source = args.input.resolve()
if not source.is_file():
    raise FileNotFoundError(source)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
# Workbench does not evaluate glTF's material nodes. Bake their base tint into a
# separate inspection color attribute so this cheap preview includes the same
# mineral/moss vertex colors without changing the imported PBR material.
binary = source.read_bytes()
json_length = struct.unpack_from("<I", binary, 12)[0]
gltf = json.loads(binary[20:20 + json_length])
base_colors = {
    entry["name"]: entry.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1])
    for entry in gltf.get("materials", [])
}
processed_meshes = set()
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    mesh = obj.data
    if mesh.as_pointer() in processed_meshes:
        continue
    processed_meshes.add(mesh.as_pointer())
    original = mesh.color_attributes.active_color
    colors = mesh.color_attributes.new(name="Preview tint", type="FLOAT_COLOR", domain="CORNER")
    for polygon in mesh.polygons:
        material = mesh.materials[polygon.material_index]
        base = base_colors.get(material.name, [1, 1, 1, 1])
        for loop in polygon.loop_indices:
            index = mesh.loops[loop].vertex_index if original and original.domain == "POINT" else loop
            tint = original.data[index].color if original else (1, 1, 1, 1)
            colors.data[loop].color = tuple(base[axis] * tint[axis] for axis in range(4))
    mesh.color_attributes.active_color = colors
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.threads_mode = "FIXED"
scene.render.threads = 2
scene.render.resolution_x = 1024
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.display.render_aa = "16"
shading = scene.display.shading
shading.light = "STUDIO"
shading.color_type = "VERTEX"
shading.show_shadows = True
shading.show_cavity = True
shading.cavity_type = "BOTH"
shading.curvature_ridge_factor = 0.65
shading.curvature_valley_factor = 0.85
shading.show_specular_highlight = True
shading.background_type = "WORLD"
scene.world = bpy.data.worlds.new("Geology inspection background")
scene.world.color = (0.032, 0.045, 0.063)
scene.view_settings.view_transform = "Standard"

# glTF Y-up arrives as Blender Z-up. Look north across the falls from the
# south-east, close to the game's three-quarter view. Guides remain meter-scale.
target = Vector((0, 0, -0.3) if args.layout else (-1.1, 7.8, 2.25))
camera_data = bpy.data.cameras.new("Geology review camera")
camera = bpy.data.objects.new("Geology review camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (24.0, -28.0, 29.0) if args.layout else (15.0, -12.0, 16.5)
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 45 if args.layout else 19
scene.camera = camera

# The plinth only belongs to the inspection file, not the exported kit/game.
# The full island has a river curtain below its rim. Keep the inspection
# floor underneath it; a floor at world zero hid the entire outward spill.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -12 if args.layout else -0.04))
plinth = bpy.context.object
plinth.name = "PREVIEW ONLY - neutral ground"
ground = bpy.data.materials.new("Preview ground")
ground.diffuse_color = (0.06, 0.084, 0.094, 1)
plinth.data.materials.append(ground)

for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type == "VIEW_3D":
        area.spaces.active.region_3d.view_perspective = "CAMERA"

# These are reproducible generated artifacts; avoid .blend1 backups on reruns.
bpy.context.preferences.filepaths.save_version = 0
scene.render.filepath = str(source.with_suffix(".png"))
bpy.ops.wm.save_as_mainfile(filepath=str(source.with_suffix(".blend")))
bpy.ops.render.render(write_still=True)
