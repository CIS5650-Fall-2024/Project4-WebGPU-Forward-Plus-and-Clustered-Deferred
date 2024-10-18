// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    inverseProjMatrix: mat4x4f,
    outputSize: vec2<f32>,
    zNear: f32,
    zFar: f32
}

struct ViewUniforms {
    matrix : mat4x4<f32>,
    invViewMatrix : mat4x4<f32>,
    position : vec3<f32>
};

struct ClusterLights {
  offset : u32,
  count : u32
};

struct ClusterLightGroup {
  offset : atomic<u32>,
  lights : array<ClusterLights, 27648>,
  indices : array<u32, 27648*${clusterMaxLights}>
};

struct ClusterBounds {
  minAABB : vec3<f32>,
  maxAABB : vec3<f32>
};

struct Clusters {
  bounds : array<ClusterBounds, 27648>
};

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}

// float compression(positive float value) 

fn float32To11Bit(value: f32) -> u32 {
    // Decomposing floating point numbers into sign, exponent and mantissa parts
    if (value == 0) {
        return 0; 
    }
    let bits: u32 = bitcast<u32>(value);  // convert float to u32
    let sign: u32 = (bits >> 31) & 0x1;   // extract sign bit
    let exponent: u32 = (bits >> 23) & 0xFF;  // extract 8-bit exponent
    let mantissa: u32 = bits & 0x7FFFFF;  // extract 23-bit mantissa

    // Adjusting exponent to 5 bits and mantissa to 6 bits
    let newExponent: u32 = u32(max(0, min(i32(exponent) - 127 + 15, 31)));  // offset exponent
    let newMantissa: u32 = mantissa >> 17;  // compress 23-bit mantissa to 6 bits

    // Packing sign, exponent and mantissa into 11-bit floating point number
    return (newExponent << 6) | newMantissa;
}

fn float32To10Bit(value: f32) -> u32 {
    let bits: u32 = bitcast<u32>(value);
    let sign: u32 = (bits >> 31) & 0x1;      // extract sign bit
    let exponent: u32 = (bits >> 23) & 0xFF; // extract 8-bit exponent
    let mantissa: u32 = bits & 0x7FFFFF;     // extract 23-bit mantissa

    // Adjusting exponent to 5 bits and mantissa to 5 bits
    let newExponent: u32 = u32(max(0, min(i32(exponent) - 127 + 15, 31)));  // offset exponent
    let newMantissa: u32 = mantissa >> 18;  // compress 23-bit mantissa to 5 bits

    // Packing sign, exponent and mantissa into 10-bit floating point number
    return (newExponent << 5) | newMantissa;
}

fn unpack11BitToFloat(value: u32) -> f32 {
    // let sign: u32 = (value >> 10) & 0x1;     // Extract sign bit
    let exponent: u32 = (value >> 6) & 0x1F; // extract 5-bit exponent
    let mantissa: u32 = value & 0x3F;        // extract 6-bit mantissa 

    // adjust exponent
    var newExponent: u32;

    if (exponent == 0) {
    newExponent = 0;
    } else {
        newExponent = exponent + 127 - 15;
    }

    let newMantissa: u32 = mantissa << 17;   // expand 6-bit mantissa to 23 bits

    // construct 32-bit floating point number
    return bitcast<f32>((0 << 31) | (newExponent << 23) | newMantissa);
}

fn unpack10BitToFloat(value: u32) -> f32 {
    // let sign: u32 = (value >> 9) & 0x1;     // Extract sign bit
    if (value == 0) {
        return 0.0; 
    }
    let exponent: u32 = (value >> 5) & 0x1F; // extract 5-bit exponent
    let mantissa: u32 = value & 0x1F;        // extract 5-bit mantissa 

    // adjust exponent
    var newExponent: u32;
    
    if (exponent == 0) {
    newExponent = 0;
    } else {
        newExponent = exponent + 127 - 15;
    }

    let newMantissa: u32 = mantissa << 18;   // expand 6-bit mantissa to 23 bits

    // construct 32-bit floating point number
    return bitcast<f32>((0 << 31) | (newExponent << 23) | newMantissa);
}

// RGB32 to R11G11B10F 
fn packRGB32To32Bit(value: vec3<f32>) -> u32 {
    let r: u32 = float32To11Bit(value.r);
    let g: u32 = float32To11Bit(value.g);
    let b: u32 = float32To10Bit(value.b);

    return (r << 21) | (g << 10) | b;
}

// R11G11B10F to RGB32
fn unpack32bitToRGB32(value: u32) -> vec3<f32> {
    let r: f32 = unpack11BitToFloat((value >> 21) & 0x7FF);
    let g: f32 = unpack11BitToFloat((value >> 10) & 0x7FF);
    let b: f32 = unpack10BitToFloat(value & 0x3FF);

    return vec3<f32>(r, g, b);
}

// ref: https://knarkowicz.wordpress.com/2014/04/16/octahedron-normal-vector-encoding/
// octahedron normal vector encoding
fn octWrap(v : vec2f) -> vec2f {
    return (1.0 - abs(v.yx)) * vec2f(select(-1.0, 1.0, v.x >= 0.0), select(-1.0, 1.0, v.y >= 0.0));
}

fn encodeNormal(n: vec3f) -> vec2f {
    var nor = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
    nor = select(octWrap(nor), nor, n.z >= 0.0);
    return nor * 0.5 + 0.5;
}

fn decodeNormal(v: vec2f) -> vec3f {
    let f = v * 2.0 - 1.0;
    var n = vec3f(f.xy, 1.0 - abs(f.x) - abs(f.y));
    let t = saturate(-n.z);
    n.x += select(t, -t, n.x >= 0.0);
    n.y += select(t, -t, n.y >= 0.0);
    return normalize(n);
}