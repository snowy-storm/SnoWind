// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@Injectable()
export class BaseWsService {
  private readonly logger = new Logger(BaseWsService.name);
  private io: Server | null = null;

  setServer(server: Server): void {
    this.io = server;
    this.logger.debug('Base WS service server reference set');
  }

  isBaseEvent(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    const op =
      typeof data.operation === 'string'
        ? data.operation
        : typeof data.event === 'string'
          ? data.event
          : '';
    return op.startsWith('base:');
  }

  async handleInbound(
    client: Socket,
    data: { event?: string; operation?: string; baseId?: string; pageId?: string; payload?: any },
  ): Promise<void> {
    const operation = data.operation ?? data.event;
    const pageId = data.pageId ?? data.baseId;
    if (!operation || !pageId) {
      this.logger.warn('Invalid base WS inbound payload, skipping');
      return;
    }

    const room = this.getBaseRoomName(pageId);

    try {
      if (operation === 'base:subscribe') {
        await client.join(room);
        this.logger.debug(
          `Client ${client.id} subscribed to base room ${room}`,
        );
        return;
      }

      if (operation === 'base:unsubscribe') {
        await client.leave(room);
        this.logger.debug(
          `Client ${client.id} unsubscribed from base room ${room}`,
        );
        return;
      }

      const rooms = Array.isArray(client.rooms)
        ? client.rooms
        : Array.from(client.rooms instanceof Set ? client.rooms : []);

      if (!rooms.includes(room)) {
        await client.join(room);
      }

      client.to(room).emit('message', {
        ...data,
        operation,
        pageId,
      });
    } catch (err) {
      this.logger.error(
        `Error handling base WS inbound event ${operation} for base ${pageId}`,
        err,
      );
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const rooms = Array.isArray(client.rooms)
      ? client.rooms
      : Array.from(client.rooms instanceof Set ? client.rooms : []);

    const baseRooms = rooms.filter((r) => r.startsWith('base-'));
    if (baseRooms.length > 0) {
      this.logger.debug(
        `Client ${client.id} disconnected, leaving base rooms: ${baseRooms.join(', ')}`,
      );
    }
  }

  private getBaseRoomName(baseId: string): string {
    return `base-${baseId}`;
  }

  async broadcastToBase(
    baseId: string,
    event: string,
    payload: any,
  ): Promise<void> {
    if (!this.io) {
      this.logger.warn('Cannot broadcast: IO server reference not set');
      return;
    }
    const room = this.getBaseRoomName(baseId);
    this.io.to(room).emit('message', {
      operation: event,
      pageId: baseId,
      ...payload,
    });
  }
}
