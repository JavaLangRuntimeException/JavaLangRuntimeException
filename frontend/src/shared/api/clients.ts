import { CalendarSyncService } from "./gen/taramanji/calendarsync/v1/calendarsync_pb";
import { ContentService } from "./gen/taramanji/content/v1/content_pb";
import { IdentityService } from "./gen/taramanji/identity/v1/identity_pb";
import { InquiryService } from "./gen/taramanji/inquiry/v1/inquiry_pb";
import { ReservationService } from "./gen/taramanji/reservation/v1/reservation_pb";
import { WorkLocationService } from "./gen/taramanji/worklocation/v1/worklocation_pb";
import { client } from "./transport";

export const identityApi = client(IdentityService);
export const inquiryApi = client(InquiryService);
export const reservationApi = client(ReservationService);
export const workLocationApi = client(WorkLocationService);
export const contentApi = client(ContentService);
export const calendarSyncApi = client(CalendarSyncService);
