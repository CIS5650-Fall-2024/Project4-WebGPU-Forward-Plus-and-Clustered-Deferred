import { Mat4, mat4, Vec3, vec3 } from "wgpu-matrix";
import { toRadians } from "../math_util";
import { device, canvas, fovYDegrees, aspectRatio } from "../renderer";
class CameraUniforms {
    readonly buffer = new ArrayBuffer(416);
    private readonly floatView = new Float32Array(this.buffer);

    private viewProjMatView = new Float32Array(this.buffer, 0, 16);
    private invViewProjMatView = new Float32Array(this.buffer, 64, 16);
    private viewMatView = new Float32Array(this.buffer, 128, 16);
    private invViewMatView = new Float32Array(this.buffer, 192, 16);
    private projMatView = new Float32Array(this.buffer, 256, 16);
    private invProjMatView = new Float32Array(this.buffer, 320, 16);
    private eyePosView = new Float32Array(this.buffer, 384, 3);
    private nearPlaneView = new Float32Array(this.buffer, 396, 1);
    private farPlaneView = new Float32Array(this.buffer, 400, 1);
    private widthView = new Float32Array(this.buffer, 404, 1);
    private heightView = new Float32Array(this.buffer, 408, 1);

    set viewProjMat(mat: Float32Array) {
        this.viewProjMatView.set(mat);
    }
    
    set invViewProjMat(mat: Float32Array) {
        this.invViewProjMatView.set(mat);
    }

    set viewMat(mat: Float32Array) {
        this.viewMatView.set(mat);
    }

    set invViewMat(mat: Float32Array) {
        this.invViewMatView.set(mat);
    }

    set projMat(mat: Float32Array) {
        this.projMatView.set(mat);
    }

    set invProjMat(mat: Float32Array) {
        this.invProjMatView.set(mat);
    }

    set eyePos(pos: Float32Array) {
        this.eyePosView.set(pos);
    }

    set nearPlane(value: number) {
        this.nearPlaneView[0] = value;
    }

    set farPlane(value: number) {
        this.farPlaneView[0] = value;
    }

    set width(value: number) {
        this.widthView[0] = value;
    }

    set height(value: number) {
        this.heightView[0] = value;
    }
}

export class Camera {
    uniforms: CameraUniforms = new CameraUniforms();
    uniformsBuffer: GPUBuffer;

    projMat: Mat4 = mat4.create();
    cameraPos: Vec3 = vec3.create(-7, 2, 0);
    cameraFront: Vec3 = vec3.create(0, 0, -1);
    cameraUp: Vec3 = vec3.create(0, 1, 0);
    cameraRight: Vec3 = vec3.create(1, 0, 0);
    yaw: number = 0;
    pitch: number = 0;
    moveSpeed: number = 0.004;
    sensitivity: number = 0.15;
    height: number = 1024;
    width: number = 1024;

    static readonly nearPlane = 0.1;
    static readonly farPlane = 30;

    keys: { [key: string]: boolean } = {};

    constructor () {
        // TODO-1.1: set `this.uniformsBuffer` to a new buffer of size `this.uniforms.buffer.byteLength`
        // ensure the usage is set to `GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST` since we will be copying to this buffer
        // check `lights.ts` for examples of using `device.createBuffer()`
        //
        // note that you can add more variables (e.g. inverse proj matrix) to this buffer in later parts of the assignment
        this.uniformsBuffer = device.createBuffer({
            size: this.uniforms.buffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // TODO-2: initialize extra buffers needed for light clustering here
        this.uniforms.nearPlane = Camera.nearPlane;
        this.uniforms.farPlane = Camera.farPlane;

        this.projMat = mat4.perspective(toRadians(fovYDegrees), aspectRatio, Camera.nearPlane, Camera.farPlane);

        this.rotateCamera(0, 0); // set initial camera vectors

        window.addEventListener('keydown', (event) => this.onKeyEvent(event, true));
        window.addEventListener('keyup', (event) => this.onKeyEvent(event, false));
        window.onblur = () => this.keys = {}; // reset keys on page exit so they don't get stuck (e.g. on alt + tab)

        canvas.addEventListener('mousedown', () => canvas.requestPointerLock());
        canvas.addEventListener('mouseup', () => document.exitPointerLock());
        canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));
    }

    private onKeyEvent(event: KeyboardEvent, down: boolean) {
        this.keys[event.key.toLowerCase()] = down;
        if (this.keys['alt']) { // prevent issues from alt shortcuts
            event.preventDefault();
        }
    }

    private rotateCamera(dx: number, dy: number) {
        this.yaw += dx;
        this.pitch -= dy;

        if (this.pitch > 89) {
            this.pitch = 89;
        }
        if (this.pitch < -89) {
            this.pitch = -89;
        }

        const front = mat4.create();
        front[0] = Math.cos(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));
        front[1] = Math.sin(toRadians(this.pitch));
        front[2] = Math.sin(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));

        this.cameraFront = vec3.normalize(front);
        this.cameraRight = vec3.normalize(vec3.cross(this.cameraFront, [0, 1, 0]));
        this.cameraUp = vec3.normalize(vec3.cross(this.cameraRight, this.cameraFront));
    }

    private onMouseMove(event: MouseEvent) {
        if (document.pointerLockElement === canvas) {
            this.rotateCamera(event.movementX * this.sensitivity, event.movementY * this.sensitivity);
        }
    }

    private processInput(deltaTime: number) {
        let moveDir = vec3.create(0, 0, 0);
        if (this.keys['w']) {
            moveDir = vec3.add(moveDir, this.cameraFront);
        }
        if (this.keys['s']) {
            moveDir = vec3.sub(moveDir, this.cameraFront);
        }
        if (this.keys['a']) {
            moveDir = vec3.sub(moveDir, this.cameraRight);
        }
        if (this.keys['d']) {
            moveDir = vec3.add(moveDir, this.cameraRight);
        }
        if (this.keys['q']) {
            moveDir = vec3.sub(moveDir, this.cameraUp);
        }
        if (this.keys['e']) {
            moveDir = vec3.add(moveDir, this.cameraUp);
        }

        let moveSpeed = this.moveSpeed * deltaTime;
        const moveSpeedMultiplier = 3;
        if (this.keys['shift']) {
            moveSpeed *= moveSpeedMultiplier;
        }
        if (this.keys['alt']) {
            moveSpeed /= moveSpeedMultiplier;
        }

        if (vec3.length(moveDir) > 0) {
            const moveAmount = vec3.scale(vec3.normalize(moveDir), moveSpeed);
            this.cameraPos = vec3.add(this.cameraPos, moveAmount);
        }
    }

    onFrame(deltaTime: number) {
        this.processInput(deltaTime);
    
        const lookPos = vec3.add(this.cameraPos, vec3.scale(this.cameraFront, 1));
        const viewMat = mat4.lookAt(this.cameraPos, lookPos, [0, 1, 0]);
        const invViewMat = mat4.invert(viewMat);
        const projMat = this.projMat;
        const invProjMat = mat4.invert(projMat);
        const viewProjMat = mat4.mul(projMat, viewMat);
        const invViewProjMat = mat4.invert(viewProjMat);
    
        this.uniforms.viewProjMat = viewProjMat;
        this.uniforms.invViewProjMat = invViewProjMat;
        this.uniforms.viewMat = viewMat;
        this.uniforms.invViewMat = invViewMat;
        this.uniforms.projMat = projMat;
        this.uniforms.invProjMat = invProjMat;
        this.uniforms.nearPlane = Camera.nearPlane;
        this.uniforms.farPlane = Camera.farPlane;
        this.uniforms.eyePos = this.cameraPos;
        this.uniforms.width = this.width;
        this.uniforms.height = this.height;
    
        device.queue.writeBuffer(this.uniformsBuffer, 0, this.uniforms.buffer);
    }
}
