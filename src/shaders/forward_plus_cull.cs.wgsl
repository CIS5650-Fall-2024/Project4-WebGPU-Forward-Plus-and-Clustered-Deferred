@group(0) @binding(0) var<uniform> res: Resolution;
@group(0) @binding(1) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(2) var<uniform> tileInfo: TileInfo;
@group(0) @binding(3) var<storage> clusterBuffer: array<ClusterAABB>;
@group(0) @binding(4) var<storage, read> lightSet: LightSet;
@group(0) @binding(5) var<storage, read_write> tilesLightIdxBuffer: array<u32>;
@group(0) @binding(6) var<storage, read_write> tilesLightGridBuffer: array<u32>;


@compute @workgroup_size(${lightCullBlockSize}, ${lightCullBlockSize}, 1)
fn computeMain(@builtin(global_invocation_id) global_id: vec3u,
    @builtin(local_invocation_id) local_id: vec3u,
    @builtin(workgroup_id) workgroup_id: vec3u,
    @builtin(num_workgroups) numTiles: vec3u) 
{
    if (global_id.x >= tileInfo.numTilesX || global_id.y >= tileInfo.numTilesY || global_id.z >= tileInfo.numTilesZ) {
        return;
    }

    // compute tile index
    var tileIdx = global_id.z * tileInfo.numTilesX * tileInfo.numTilesY + global_id.y * tileInfo.numTilesX + global_id.x;
    var tileMin = clusterBuffer[tileIdx].min;
    var tileMax = clusterBuffer[tileIdx].max;

    // cull lights
    var lightCount = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights && lightCount < ${maxLightsPerTile}; lightIdx++) {
        var light = lightSet.lights[lightIdx];
        var lightPos = (cameraUniforms.view * vec4<f32>(light.pos, 1.0)).xyz;
        if (calculateLightIntersection(lightPos, tileMin, tileMax)) {
            tilesLightIdxBuffer[tileIdx * ${maxLightsPerTile} + lightCount] = lightIdx;
            lightCount += 1u;
        }
    }
    tilesLightGridBuffer[tileIdx] = lightCount;
    // tilesLightGridBuffer[tileIdx] = 200;
}