import { BaseTool } from "./BaseTool"

export class ToolManager {
  activeTool: BaseTool | null = null
  selectTool: BaseTool | null = null
  controls: any = null

  constructor(selectTool: BaseTool | null = null, controls: any = null) {
    this.selectTool = selectTool
    this.controls = controls
  }

  setSelectTool(tool: BaseTool) {
    this.selectTool = tool
  }

  setControls(controls: any) {
    this.controls = controls
  }

  setTool(tool: BaseTool) {
    if (this.activeTool) {
      this.activeTool.deactivate()
    }

    this.activeTool = tool
    this.activeTool.activate()

    if (this.controls) {
      this.controls.enabled = true
    }
  }

  onPointerDown(event: PointerEvent) {
    if (!this.activeTool) return
    this.activeTool.onPointerDown(event)
  }

  onPointerMove(event: PointerEvent) {
    if (!this.activeTool) return
    this.activeTool.onPointerMove(event)
  }

  onPointerUp(event: PointerEvent) {
    if (!this.activeTool) return
    this.activeTool.onPointerUp(event)
  }

  onPointerCancel(event: PointerEvent) {
    if (!this.activeTool) return
    this.activeTool.onPointerCancel(event)
  }

  onMouseMove(event: MouseEvent) {
    if (!this.activeTool) return
    this.activeTool.onMouseMove(event)
  }

  onClick(event: MouseEvent) {
    if (!this.activeTool) return
    this.activeTool.onClick(event)
  }

  onMouseDown(event: MouseEvent) {
    if (!this.activeTool) return
    this.activeTool.onMouseDown(event)
  }

  onMouseUp(event: MouseEvent) {
    if (!this.activeTool) return
    this.activeTool.onMouseUp(event)
  }

  onKeyDown(event: KeyboardEvent) {
    if (!this.activeTool) return
    this.activeTool.onKeyDown(event)
  }

  cancelActiveTool() {
    this.activeTool?.cancel()
  }

  onDoubleClick(event: MouseEvent) {
    if (!this.activeTool) return
    this.activeTool.onDoubleClick?.(event)
  }
}
