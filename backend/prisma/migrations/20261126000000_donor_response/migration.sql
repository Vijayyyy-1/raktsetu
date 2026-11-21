-- Donors can raise their hand for a request; coordinators see them first.
ALTER TYPE "OutreachStatus" ADD VALUE 'RESPONDED' BEFORE 'CALLED';
