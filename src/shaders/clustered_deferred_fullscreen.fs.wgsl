// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1)  @binding(0) var gBufferNormalTex: texture_2d<f32>;
@group(1) @binding(1) var gBufferDiffuseTex: texture_2d<f32>;
@group(1) @binding(2) var gBufferDepth: texture_depth_2d;


fn world_from_screen_coord(coord : vec2f, depth_sample: f32) -> vec3f {
  // reconstruct world-space position from the screen coordinate.
  let posClip = vec4(coord.x * 2.0 - 1.0, (1.0 - coord.y) * 2.0 - 1.0, depth_sample, 1.0);
  let posWorldW = cameraUniforms.invViewMat * cameraUniforms.inverseProjMat * posClip;
  let posWorld = posWorldW.xyz / posWorldW.www;
  return posWorld;
}

fn screenToView(screenCoord: vec2f, depth:f32) -> vec3f {
    var ndc: vec4f = vec4f(screenCoord / vec2f(cameraUniforms.canvasSizeX, cameraUniforms.canvasSizeY) * 2.0 - 1.0, depth, 1.0);
    var viewCoord: vec4f = cameraUniforms.inverseProjMat * ndc;
    viewCoord /= viewCoord.w;

    return viewCoord.xyz;
}

@fragment
fn main(
  @builtin(position) coord : vec4f
) -> @location(0) vec4f
{
    let depth = textureLoad(gBufferDepth, vec2<i32>(i32(coord.x), i32(coord.y)), 0);

    let bufferSize = textureDimensions(gBufferDepth);
    let uv = vec2<f32>(coord.x / f32(bufferSize.x), coord.y / f32(bufferSize.y));
    let position = screenToView(uv, depth);
    //let position_world = cameraUniforms.invViewMat * vec4<f32>(position, 1.0);
    let position_world = world_from_screen_coord(uv, depth);

    let normal = textureLoad(gBufferNormalTex, vec2<i32>(i32(coord.x), i32(coord.y)), 0).xyz;
    let albedo = textureLoad(gBufferDiffuseTex, vec2<i32>(i32(coord.x), i32(coord.y)), 0);

    var totalLightContrib = vec3<f32>(0.0, 0.0, 0.0);

    var zTile = log(abs(position.z) / cameraUniforms.zNear) / log(cameraUniforms.zFar / cameraUniforms.zNear);
    zTile = f32(floor(zTile * f32(cameraUniforms.tileCountZ)));
    var tileZIdx = zTile / cameraUniforms.tileCountZ;// for debugging

    var tilePixelSize_X = cameraUniforms.canvasSizeX / cameraUniforms.tileCountX;
    var tilePixelSize_Y = cameraUniforms.canvasSizeY / f32(cameraUniforms.tileCountY);

    var tileXYZ = vec3u(
        min(u32(cameraUniforms.tileCountX) - 1u, u32(coord.x / f32(tilePixelSize_X) )),
        min(u32(cameraUniforms.tileCountY) - 1u, u32(coord.y / f32(tilePixelSize_Y) )),
        min(u32(cameraUniforms.tileCountZ) - 1u, u32(zTile))
    );
    var tileIdx = tileXYZ.x + tileXYZ.y * u32(cameraUniforms.tileCountX) + tileXYZ.z * u32(cameraUniforms.tileCountX) * u32(cameraUniforms.tileCountY);

    for (var lightIdx = 0u; lightIdx < clusterSet.clusters[tileIdx].lightCount; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[tileIdx].lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, position_world.xyz, normal);
    }

    var finalColor = vec3f(0.0, 0.0, 0.0);
    finalColor = albedo.rgb * totalLightContrib;

// -------------    Debugging  ----------------
    // let colorOptions = array<vec3f, 8>(
    //     vec3f(1.0, 0.0, 0.0),  // Red
    //     vec3f(0.0, 1.0, 0.0),  // Green
    //     vec3f(0.0, 0.0, 1.0),  // Blue
    //     vec3f(1.0, 1.0, 0.0),  // Yellow
    //     vec3f(1.0, 0.0, 1.0),  // Magenta
    //     vec3f(0.0, 1.0, 1.0),  // Cyan
    //     vec3f(1.0, 1.0, 1.0),  // White
    //     vec3f(0.5, 0.5, 0.5)   // Grey
    // );

    // let colorIdx = u32(tileXYZ.x + tileXYZ.y + tileXYZ.z) % 8;
    //finalColor += colorOptions[colorIdx];

    //-------- Debugging End ---------------

    return vec4<f32>(finalColor, 1.0);
}