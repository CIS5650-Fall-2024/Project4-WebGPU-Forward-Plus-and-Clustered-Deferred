@group(${bindGroup_scene}) @binding(0) var<uniform> camUniforms: CameraUniforms;

@group(${bindGroup_model}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_model}) @binding(1) var<storage, read_write> clusterSet : ClusterSet;

fn project_sphere_flat(view_xy : f32, view_z : f32) -> vec2f
{
    let len = length(vec2f(view_xy, view_z));
    let sin_xy = ${lightRadius} / len;

    var result = vec2f(0.f);

    if (sin_xy < 0.999f)
    {
        let cos_xy = sqrt(1.0 - sin_xy * sin_xy);

        var rot_lo = mat2x2f(cos_xy, sin_xy, -sin_xy, cos_xy) * vec2f(view_xy, view_z);
        var rot_hi = mat2x2f(cos_xy, -sin_xy, sin_xy, cos_xy) * vec2f(view_xy, view_z);

        if (rot_lo.y <= 0.f){
            rot_lo = vec2f(-1.0, 0.0);
        }
        if (rot_hi.y <= 0.0){
            rot_hi = vec2f(1.0, 0.0);
        }

        result = vec2f(rot_lo.x / rot_lo.y, rot_hi.x / rot_hi.y);
    }
    else
    {
        // We're inside the sphere, so range is infinite in both directions.
        result = vec2f(-1000000.0, 1000000.0);
    }

    return result;
}

fn two_rect_overlap(aXrange : vec2f, aYrange : vec2f, bXrange : vec2f, bYrange : vec2f) -> bool
{
    return aXrange.x <= bXrange.y && aXrange.y >= bXrange.x && aYrange.x <= bYrange.y && aYrange.y >= bYrange.x;
}

@compute
@workgroup_size(${moveLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let idx = globalIdx.x;
    if (idx >= clusterSet.width * clusterSet.height) {
        return;
    }

    let xId = idx % clusterSet.width;
    let yId = idx / clusterSet.width;
    let step = vec2f(f32(${tileSize}) / f32(camUniforms.screenSize.x), f32(${tileSize}) / f32(camUniforms.screenSize.y));
    let xBound = vec2f(f32(xId), f32(xId + 1)) * step.x;
    let yBound = vec2f(f32(yId), f32(yId + 1)) * step.y;

    // four points of the frustum on the near plane
    let side0 = normalize(vec3f((2.f * xBound.x - 1.f) * camUniforms.tanHalfFov * camUniforms.aspectRatio,
                    (1.f - 2.f * yBound.x) * camUniforms.tanHalfFov, -1));
    let side1 = normalize(vec3f((2.f * xBound.y - 1.f) * camUniforms.tanHalfFov * camUniforms.aspectRatio,
                    (1.f - 2.f * yBound.x) * camUniforms.tanHalfFov, -1));
    let side2 = normalize(vec3f((2.f * xBound.x - 1.f) * camUniforms.tanHalfFov * camUniforms.aspectRatio,
                    (1.f - 2.f * yBound.y) * camUniforms.tanHalfFov, -1));
    let side3 = normalize(vec3f((2.f * xBound.y - 1.f) * camUniforms.tanHalfFov * camUniforms.aspectRatio,
                    (1.f - 2.f * yBound.y) * camUniforms.tanHalfFov, -1));

    let tileCenter = normalize(side0 + side1 + side2 + side3);
    let tileCos = min(min(min(dot(tileCenter, side0), dot(tileCenter, side1)), dot(tileCenter, side2)), dot(tileCenter, side3));
    let tileSin = sqrt(1 - tileCos * tileCos);

    
    var lightCnt : u32 = 0;
    for (var lightIdx : u32 = 0; lightIdx < lightSet.numLights; lightIdx++) {
        let light = lightSet.lights[lightIdx];
        
        // using cone test to check if light is in the tile
        let lightDist = length(light.pos);
        let lightCetner = light.pos / lightDist;
        let lightSin = clamp(${lightRadius} / lightDist, 0.f, 1.f);
        let lightCos = sqrt(1.f - lightSin * lightSin);
        let lightTileCos = dot(lightCetner, tileCenter);
        let sumCos = select((tileCos * lightCos - tileSin * lightSin), -1.f, ${lightRadius} > lightDist);
        
        if (lightTileCos >= sumCos)
        {
            // light intersect this tile
            clusterSet.clusters[idx].lights[lightCnt] = lightIdx;
            lightCnt++;
        }

        if (lightCnt >= ${maxLightsPerTile} - 1){
            break;
        }
    }
    clusterSet.clusters[idx].lights[${maxLightsPerTile} - 1] = lightCnt;
}
